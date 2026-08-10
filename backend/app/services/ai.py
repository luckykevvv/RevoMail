"""
AI service — wraps OpenAI to provide email summarisation,
reply drafting, and information extraction.

All functions are synchronous (run in a thread pool via FastAPI's
run_in_threadpool) so the async event loop is never blocked.
"""

import json
import re

from openai import OpenAI
from backend.app.config import settings

_MODEL = settings.openai_model


def _parse_json(raw: str) -> dict:
    """Parse JSON from model output, stripping markdown code fences if present."""
    # Strip ```json ... ``` or ``` ... ``` wrappers the model sometimes adds
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip())
    return json.loads(cleaned)


def _clean_body(body: str) -> str:
    """
    Strip residual HTML tags and collapse whitespace so the model
    receives clean readable text rather than markup noise.
    """
    # Remove any remaining tags (e.g. from HTML fallback path)
    text = re.sub(r"<[^>]+>", " ", body)
    # Collapse runs of whitespace / newlines into single spaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _chat(system: str, user: str, max_tokens: int = 512) -> str:
    """Send a single-turn chat request and return the text response."""
    if not settings.openai_api_key:
        raise RuntimeError("OpenAI is not configured.")
    response = OpenAI(api_key=settings.openai_api_key).chat.completions.create(
        model=_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        max_tokens=max_tokens,
        temperature=0.4,
    )
    return response.choices[0].message.content.strip()


# ---------------------------------------------------------------------------
# Summarise
# ---------------------------------------------------------------------------

SUMMARISE_SYSTEM = """You are RevoMail's email assistant. Your job is to produce
clear, accurate, concise summaries of emails.

Rules:
- Only use information present in the email — never invent or assume details.
- If a value is uncertain, say so explicitly.
- Return a JSON object with two keys:
    "summary": a 2-4 sentence plain-English summary.
    "bullets": a list of 2-5 key points (strings), each under 15 words.
- Return valid JSON only — no markdown fences, no extra text."""

def summarise(subject: str, sender: str, body: str) -> dict:
    """Return { summary, bullets } for a single email."""
    user = f"Subject: {subject}\nFrom: {sender}\n\n{_clean_body(body)[:15000]}"
    raw = _chat(SUMMARISE_SYSTEM, user, max_tokens=400)
    try:
        return _parse_json(raw)
    except Exception:
        return {"summary": raw, "bullets": []}


# ---------------------------------------------------------------------------
# Draft reply
# ---------------------------------------------------------------------------

TONE_INSTRUCTIONS = {
    "professional": "Write in a polished, professional tone suitable for a workplace or academic context.",
    "concise": "Write as briefly as possible — get straight to the point in 2-4 sentences.",
    "friendly": "Write in a warm, conversational tone as if replying to a friend or close colleague.",
}

DRAFT_SYSTEM = """You are RevoMail's email assistant. Draft a reply to the email
provided by the user.

Rules:
- Base your reply only on the content of the original email.
- Do not include a subject line.
- End with 'Best regards,\\n[Your name]' as a placeholder sign-off.
- Return the reply body text only — no extra commentary."""

def draft_reply(subject: str, sender: str, body: str, tone: str = "professional") -> str:
    """Return a plain-text reply draft."""
    tone_note = TONE_INSTRUCTIONS.get(tone, TONE_INSTRUCTIONS["professional"])
    system = f"{DRAFT_SYSTEM}\n\nTone instruction: {tone_note}"
    user = f"Original email\nSubject: {subject}\nFrom: {sender}\n\n{_clean_body(body)[:15000]}"
    return _chat(system, user, max_tokens=600)


# ---------------------------------------------------------------------------
# Extract tasks and events
# ---------------------------------------------------------------------------

EXTRACT_SYSTEM = """You are RevoMail's email assistant. Extract structured
information from the email provided.

Return a JSON object with these keys (omit a key if not found):
  "events": list of objects, each with:
      "title", "date" (ISO 8601 or natural language), "time", "location", "organiser"
  "tasks": list of objects, each with:
      "title", "due_date" (ISO 8601 or natural language), "notes"

Rules:
- Only extract information explicitly stated in the email.
- If a date is relative (e.g. "tomorrow"), note it as-is — do not resolve it.
- Return valid JSON only — no markdown fences, no extra text."""

def extract(subject: str, sender: str, body: str) -> dict:
    """Return { events: [...], tasks: [...] } extracted from the email."""
    user = f"Subject: {subject}\nFrom: {sender}\n\n{_clean_body(body)[:15000]}"
    raw = _chat(EXTRACT_SYSTEM, user, max_tokens=600)
    try:
        return _parse_json(raw)
    except Exception:
        return {"events": [], "tasks": [], "raw": raw}
