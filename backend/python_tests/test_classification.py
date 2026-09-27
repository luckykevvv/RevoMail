import json

import httpx
import openai
import pytest

from backend.app.services import ai


BATCH = [
    {"id": "19a3f0c2b7d4e611", "sender": "boss@example.com", "subject": "Need your approval by 5pm", "preview": "Can you sign off today?"},
    {"id": "1234567890123456", "sender": "news@shop.example", "subject": "50% OFF everything", "preview": "Limited time sale"},
    {"id": "1e5", "sender": "noreply@bank.example", "subject": "Your statement is ready", "preview": "Statement for August"},
]
IDS = [item["id"] for item in BATCH]


def fake_model(monkeypatch, reply):
    seen = {}

    def _chat(system, user, max_tokens=512, temperature=0.4, json_mode=False):
        seen.update(system=system, user=user, max_tokens=max_tokens, temperature=temperature, json_mode=json_mode)
        return reply if isinstance(reply, str) else json.dumps(reply)

    monkeypatch.setattr(ai, "_chat", _chat)
    return seen


def labels(result):
    return {message_id: value["priority"] for message_id, value in result["classifications"].items()}


def test_classify_maps_short_ids_back_to_provider_ids(monkeypatch):
    seen = fake_model(
        monkeypatch,
        {
            "results": [
                {"id": "1", "priority": "high", "reason": "Approval needed today"},
                {"id": "2", "priority": "LOW", "reason": "Promotional sale"},
                {"id": "3", "priority": "medium", "reason": "Routine statement notice"},
            ]
        },
    )
    result = ai.classify(BATCH)
    assert result["warning"] is None
    assert result["classifications"] == {
        IDS[0]: {"priority": "high", "reason": "Approval needed today"},
        IDS[1]: {"priority": "low", "reason": "Promotional sale"},
        IDS[2]: {"priority": "medium", "reason": "Routine statement notice"},
    }
    # The model only ever sees short ids, never the long provider ids it could mangle.
    assert '"id": "1"' in seen["user"] and IDS[0] not in seen["user"]
    assert seen["temperature"] == 0 and seen["json_mode"] is True
    assert "boss@example.com" in seen["user"]


@pytest.mark.parametrize(
    "reply",
    [
        # bare list
        [{"id": "1", "priority": "high"}, {"id": "2", "priority": "low"}, {"id": "3", "priority": "medium"}],
        # numeric ids instead of strings
        {"results": [{"id": 1, "priority": "high"}, {"id": 2, "priority": "low"}, {"id": 3, "priority": "medium"}]},
        # object keyed by id, plain-string labels
        {"1": "high", "2": "low", "3": "medium"},
        # object keyed by id, object values, under a different wrapper key
        {"classifications": {"1": {"priority": "High"}, "2": {"priority": "low"}, "3": {"priority": "Medium"}}},
        # no ids at all: fall back to position
        {"results": [{"priority": "high"}, {"priority": "low"}, {"priority": "medium"}]},
        # labels with extra words
        {"results": [{"id": "1", "priority": "High priority"}, {"id": "2", "priority": "low-priority"}, {"id": "3", "priority": " Medium "}]},
    ],
)
def test_classify_accepts_common_reply_shapes(monkeypatch, reply):
    fake_model(monkeypatch, reply)
    result = ai.classify(BATCH)
    assert result["warning"] is None
    assert labels(result) == {IDS[0]: "high", IDS[1]: "low", IDS[2]: "medium"}


def test_classify_drops_invented_ids_and_invalid_priorities(monkeypatch):
    fake_model(
        monkeypatch,
        {
            "results": [
                {"id": "1", "priority": "urgent", "reason": "not a valid level"},
                {"id": "99", "priority": "high", "reason": "not in the batch"},
                {"id": "2", "priority": "low", "reason": "ok"},
                {"id": "3", "priority": "high|medium|low", "reason": "ambiguous"},
                "not-an-object",
            ]
        },
    )
    result = ai.classify(BATCH)
    assert result["classifications"] == {IDS[1]: {"priority": "low", "reason": "ok"}}
    assert result["warning"] is None


def test_classify_tolerates_code_fences_and_surrounding_prose(monkeypatch):
    fake_model(monkeypatch, '```json\n{"results": [{"id": "1", "priority": "high", "reason": "x"}]}\n```')
    assert labels(ai.classify(BATCH)) == {IDS[0]: "high"}
    fake_model(monkeypatch, 'Sure! Here you go:\n{"results": [{"id": "2", "priority": "low", "reason": "y"}]}\nHope that helps.')
    assert labels(ai.classify(BATCH)) == {IDS[1]: "low"}


def test_classify_reports_why_nothing_was_labelled(monkeypatch, caplog):
    fake_model(monkeypatch, "I cannot help with that.")
    with caplog.at_level("WARNING", logger="revomail.ai"):
        assert ai.classify(BATCH) == {"classifications": {}, "warning": "unreadable_reply"}
    assert "not valid JSON" in caplog.text and "cannot help" not in caplog.text  # never log reply content

    fake_model(monkeypatch, {"results": "nope"})
    assert ai.classify(BATCH) == {"classifications": {}, "warning": "no_valid_labels"}
    fake_model(monkeypatch, {"results": [{"id": "1", "priority": "someday"}]})
    assert ai.classify(BATCH)["warning"] == "no_valid_labels"


def test_classify_truncates_reason_and_strips_markup(monkeypatch):
    fake_model(monkeypatch, {"results": [{"id": "1", "priority": "high", "reason": "<b>" + "x" * 500 + "</b>"}]})
    reason = ai.classify(BATCH)["classifications"][IDS[0]]["reason"]
    assert len(reason) == 140 and "<" not in reason


def test_classify_falls_back_when_json_mode_is_unsupported(monkeypatch):
    calls = []

    def _chat(system, user, max_tokens=512, temperature=0.4, json_mode=False):
        calls.append(json_mode)
        if json_mode:
            request = httpx.Request("POST", "https://api.openai.example/v1/chat/completions")
            raise openai.BadRequestError("json mode unsupported", response=httpx.Response(400, request=request), body=None)
        return json.dumps({"results": [{"id": "1", "priority": "high", "reason": "ok"}]})

    monkeypatch.setattr(ai, "_chat", _chat)
    assert labels(ai.classify(BATCH)) == {IDS[0]: "high"}
    assert calls == [True, False]


def test_classify_empty_batch_makes_no_model_call(monkeypatch):
    monkeypatch.setattr(ai, "_chat", lambda *a, **k: pytest.fail("model must not be called"))
    assert ai.classify([]) == {"classifications": {}, "warning": None}


def test_classify_limits_batch_size(monkeypatch):
    seen = fake_model(monkeypatch, {"results": []})
    many = [{"id": f"id{i}", "sender": "a", "subject": "s", "preview": "p"} for i in range(ai.MAX_CLASSIFY_BATCH + 10)]
    ai.classify(many)
    assert seen["user"].count('"id"') == ai.MAX_CLASSIFY_BATCH
