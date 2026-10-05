import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from backend.app.dependencies import require_session, require_tokens
from backend.app.errors import ProviderError
from backend.app.services import ai as ai_service
from backend.app.services import gmail as gmail_service


async def configure_preferences(request: Request, session=Depends(require_session)):
    preferences = request.app.state.preferences.get(session.user["id"])
    token = ai_service.request_preferences.set({**preferences, "apiKey": request.app.state.settings.openai_api_key})
    try:
        yield
    finally:
        ai_service.request_preferences.reset(token)


router = APIRouter(dependencies=[Depends(configure_preferences)])


class EmailRef(BaseModel):
    message_id: str
    tone: str = "professional"


class DraftReplyRequest(EmailRef):
    instructions: str = Field(default="", max_length=ai_service.MAX_INSTRUCTIONS)
    current_draft: str = Field(default="", max_length=ai_service.MAX_DRAFT_CHARS)


class ComposeRequest(BaseModel):
    instructions: str = Field(min_length=1, max_length=ai_service.MAX_INSTRUCTIONS)
    tone: str = "professional"
    subject: str = Field(default="", max_length=300)
    current_draft: str = Field(default="", max_length=ai_service.MAX_DRAFT_CHARS)


def _get_email_text(tokens: dict, message_id: str) -> dict:
    """Fetch a message and return provider-neutral text fields."""
    message = gmail_service.get_message(tokens, message_id)
    body = message.get("body_plain") or ""
    if not body and message.get("body_html_clean"):
        body = re.sub(r"<[^>]+>", " ", message["body_html_clean"])
    return {
        "subject": message.get("subject", ""),
        "sender": message.get("sender", ""),
        "date": message.get("date", ""),
        "body": body,
    }


def _provider_failure(exc: Exception) -> ProviderError:
    return ProviderError(
        "AI_PROVIDER_FAILED",
        "The AI provider could not complete the request.",
        502,
        True,
    )


@router.post("/summarise")
async def summarise(payload: EmailRef, tokens: dict = Depends(require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        return await run_in_threadpool(ai_service.summarise, email["subject"], email["sender"], email["body"])
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc


@router.post("/draft-reply")
async def draft_reply(
    payload: DraftReplyRequest,
    tokens: dict = Depends(require_tokens),
    session=Depends(require_session),
):
    """Draft a reply. `instructions` say what the user wants to say; `current_draft` is revised if given."""
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        draft = await run_in_threadpool(
            ai_service.draft_reply,
            email["subject"],
            email["sender"],
            email["body"],
            payload.tone,
            payload.instructions,
            payload.current_draft,
            session.user.get("displayName") or "",
        )
        return {"draft": draft}
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc


@router.post("/compose")
async def compose(payload: ComposeRequest, session=Depends(require_session)):
    """Write a new email (or revise the current draft) from the user's instructions. Never sends anything."""
    try:
        return await run_in_threadpool(
            ai_service.compose,
            payload.instructions,
            payload.tone,
            payload.subject,
            payload.current_draft,
            session.user.get("displayName") or "",
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc


@router.post("/extract")
async def extract(payload: EmailRef, tokens: dict = Depends(require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        return await run_in_threadpool(ai_service.extract, email["subject"], email["sender"], email["body"], email["date"])
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc


class ClassifyItem(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    sender: str = Field(default="", max_length=500)
    subject: str = Field(default="", max_length=1000)
    preview: str = Field(default="", max_length=2000)


class ClassifyRequest(BaseModel):
    messages: list[ClassifyItem] = Field(min_length=1, max_length=ai_service.MAX_CLASSIFY_BATCH)


@router.post("/classify")
async def classify(payload: ClassifyRequest, tokens: dict = Depends(require_tokens)):
    """Label inbox messages high / medium / low priority from list metadata (no bodies fetched)."""
    try:
        results = await run_in_threadpool(ai_service.classify, [item.model_dump() for item in payload.messages])
        return results
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc
