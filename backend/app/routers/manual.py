"""Session-only manual analysis; deliberately independent of mailbox dependencies."""
from collections import deque
import time
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.app.dependencies import require_csrf
from backend.app.errors import AppError
from backend.app.routers.ai import configure_preferences, _provider_failure
from backend.app.services import ai as ai_service
from backend.app.services.manual_email import MAX_JSON, MAX_UPLOAD, ManualEmail, parse_upload

router = APIRouter(dependencies=[Depends(configure_preferences)])


class ManualDraft(ManualEmail):
    tone: Literal["professional", "concise", "friendly"] = "professional"
    instructions: str = Field(default="", max_length=ai_service.MAX_INSTRUCTIONS)
    current_draft: str = Field(default="", max_length=ai_service.MAX_DRAFT_CHARS)


class SummaryResult(BaseModel):
    model_config = ConfigDict(strict=True)
    summary: str = Field(min_length=1, max_length=20000)
    bullets: list[str] = Field(default_factory=list, max_length=100)


class EventSuggestion(BaseModel):
    model_config = ConfigDict(strict=True)
    title: str = Field(max_length=1000)
    date: str | None = None
    time: str | None = None
    location: str | None = None
    organiser: str | None = None
    start: str | None = None
    end: str | None = None
    all_day: bool = False


class TaskSuggestion(BaseModel):
    model_config = ConfigDict(strict=True)
    title: str = Field(max_length=1000)
    due_date: str | None = None
    notes: str | None = None


class ExtractionResult(BaseModel):
    events: list[EventSuggestion] = Field(default_factory=list, max_length=100)
    tasks: list[TaskSuggestion] = Field(default_factory=list, max_length=100)


async def bounded_body(request: Request, limit: int) -> bytes:
    data = bytearray()
    try:
        async for chunk in request.stream():
            if len(data) + len(chunk) > limit:
                raise AppError("MANUAL_TOO_LARGE", "The request exceeds the manual input size limit.", 413)
            data.extend(chunk)
        return bytes(data)
    finally:
        data.clear()


def _admit(request, user_id):
    now = time.monotonic()
    attempts = request.app.state.manual_attempts
    for key in list(attempts):
        while attempts[key] and attempts[key][0] <= now - 60:
            attempts[key].popleft()
        if not attempts[key]:
            del attempts[key]
    entries = attempts.setdefault(user_id, deque())
    if len(entries) >= request.app.state.settings.manual_ai_limit_per_minute:
        raise AppError("MANUAL_RATE_LIMITED", "Too many AI actions. Try again in a minute.", 429, True)
    entries.append(now)


@router.post("/import")
async def import_email(request: Request, format: str = "", session=Depends(require_csrf)):
    allowed = {"txt": {"text/plain", "application/octet-stream"}, "eml": {"message/rfc822", "application/octet-stream", "text/plain"}}
    mime = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if format not in allowed or mime not in allowed[format]:
        raise AppError("MANUAL_UNSUPPORTED_FILE", "Only plain-text .txt and standard .eml uploads are supported.", 415)
    raw = await bounded_body(request, MAX_UPLOAD)
    return await run_in_threadpool(parse_upload, raw, format)


@router.post("/{operation}")
async def analyse(operation: str, request: Request, session=Depends(require_csrf)):
    if operation not in {"summarise", "classify", "extract", "draft-reply"}:
        raise AppError("MANUAL_INVALID_OPERATION", "Choose a supported analysis action.", 404)
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise AppError("MANUAL_INVALID_INPUT", "Supply the email as JSON.", 415)
    raw = await bounded_body(request, MAX_JSON)
    try:
        payload = (ManualDraft if operation == "draft-reply" else ManualEmail).model_validate_json(raw)
    except ValidationError:
        raise AppError("MANUAL_INVALID_INPUT", "Supply nonempty email text (up to 15,000 characters) and valid optional fields.", 422) from None
    if not request.app.state.settings.openai_api_key:
        raise AppError("AI_UNAVAILABLE", "AI analysis is not configured. Contact the RevoMail administrator.", 503)
    _admit(request, session.user["id"])
    args = (payload.subject, payload.sender, payload.body)
    try:
        if operation == "summarise":
            result = await run_in_threadpool(ai_service.summarise, *args)
            return SummaryResult.model_validate(result).model_dump()
        if operation == "extract":
            result = await run_in_threadpool(ai_service.extract, *args, payload.email_date)
            validated = ExtractionResult.model_validate(result).model_dump()
            return {**validated, "warning": "unreadable_reply" if "raw" in result else None}
        if operation == "classify":
            result = await run_in_threadpool(ai_service.classify, [{"id": "manual", "subject": payload.subject, "sender": payload.sender, "preview": payload.body[:400]}])
            label = result.get("classifications", {}).get("manual")
            if label and label.get("priority") not in ai_service.PRIORITIES:
                raise ValueError("Invalid priority")
            if label and (not isinstance(label.get("reason"), str) or len(label["reason"]) > 140):
                raise ValueError("Invalid reason")
            return {"priority": label["priority"] if label else None, "reason": label["reason"] if label else "", "warning": result.get("warning") if result.get("warning") in {"unreadable_reply", "no_valid_labels"} else (None if label else "no_valid_labels")}
        draft = await run_in_threadpool(ai_service.draft_reply, *args, payload.tone, payload.instructions, payload.current_draft, session.user.get("displayName", ""))
        if not isinstance(draft, str) or not draft.strip() or len(draft) > ai_service.MAX_DRAFT_CHARS:
            raise ValueError("Invalid draft")
        return {"draft": draft}
    except Exception as exc:
        raise _provider_failure(exc) from None
