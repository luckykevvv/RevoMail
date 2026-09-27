from fastapi import APIRouter, Depends, Query
from fastapi.concurrency import run_in_threadpool
from googleapiclient.errors import HttpError

from backend.app.dependencies import require_tokens
from backend.app.errors import AppError, ProviderError
from backend.app.services import gmail as gmail_service


router = APIRouter()


@router.get("")
async def list_emails(
    tokens: dict = Depends(require_tokens),
    max_results: int = Query(default=20, ge=1, le=100),
    page_token: str | None = Query(default=None),
):
    try:
        return await run_in_threadpool(gmail_service.list_messages, tokens, max_results, page_token)
    except Exception as exc:
        raise ProviderError(
            "EMAIL_PROVIDER_FAILED",
            "The mailbox provider could not complete the request.",
            502,
            True,
        ) from exc


@router.get("/{message_id}")
async def get_email(message_id: str, tokens: dict = Depends(require_tokens)):
    try:
        return await run_in_threadpool(gmail_service.get_message, tokens, message_id)
    except Exception as exc:
        raise ProviderError(
            "EMAIL_PROVIDER_FAILED",
            "The mailbox provider could not complete the request.",
            502,
            True,
        ) from exc


@router.post("/{message_id}/read")
async def mark_email_read(message_id: str, tokens: dict = Depends(require_tokens)):
    """Mark a message as read in Gmail (removes the UNREAD label). Idempotent."""
    try:
        return await run_in_threadpool(gmail_service.mark_read, tokens, message_id)
    except HttpError as exc:
        if getattr(exc, "status_code", None) == 403 or getattr(getattr(exc, "resp", None), "status", None) == 403:
            raise AppError(
                "INSUFFICIENT_PERMISSIONS",
                "RevoMail needs permission to mark emails as read. Reconnect your Google account in Settings.",
                403,
            ) from exc
        raise ProviderError(
            "EMAIL_PROVIDER_FAILED",
            "The mailbox provider could not complete the request.",
            502,
            True,
        ) from exc
    except Exception as exc:
        raise ProviderError(
            "EMAIL_PROVIDER_FAILED",
            "The mailbox provider could not complete the request.",
            502,
            True,
        ) from exc
