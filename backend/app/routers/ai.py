import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from backend.app.dependencies import require_tokens
from backend.app.errors import ProviderError
from backend.app.services import ai as ai_service
from backend.app.services import gmail as gmail_service


router = APIRouter()


class EmailRef(BaseModel):
    message_id: str
    tone: str = "professional"


def _get_email_text(tokens: dict, message_id: str) -> dict:
    """Fetch a message and return provider-neutral text fields."""
    message = gmail_service.get_message(tokens, message_id)
    body = message.get("body_plain") or ""
    if not body and message.get("body_html_clean"):
        body = re.sub(r"<[^>]+>", " ", message["body_html_clean"])
    return {
        "subject": message.get("subject", ""),
        "sender": message.get("sender", ""),
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
async def draft_reply(payload: EmailRef, tokens: dict = Depends(require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        draft = await run_in_threadpool(
            ai_service.draft_reply,
            email["subject"],
            email["sender"],
            email["body"],
            payload.tone,
        )
        return {"draft": draft}
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc


@router.post("/extract")
async def extract(payload: EmailRef, tokens: dict = Depends(require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        return await run_in_threadpool(ai_service.extract, email["subject"], email["sender"], email["body"])
    except HTTPException:
        raise
    except Exception as exc:
        raise _provider_failure(exc) from exc
