from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from googleapiclient.errors import HttpError

from backend.app.contracts import SendEmailRequest
from backend.app.dependencies import require_session, require_tokens
from backend.app.errors import AppError, ProviderError
from backend.app.idempotency import request_hash
from backend.app.once import OnceConfig, execute_once
from backend.app.services import gmail as gmail_service


router = APIRouter()
SEND_OPERATION = "email.send"


@router.get("")
async def list_emails(
    tokens: dict = Depends(require_tokens),
    max_results: int = Query(default=20, ge=1, le=100),
    page_token: str | None = Query(default=None),
    label: str = Query(default="INBOX"),
):
    label = label.upper()
    if label not in gmail_service.MAILBOX_LABELS:
        raise AppError("INVALID_REQUEST", "The requested mailbox is not supported.", 422)
    try:
        return await run_in_threadpool(gmail_service.list_messages, tokens, max_results, page_token, label)
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


SEND_ONCE = OnceConfig(
    operation=SEND_OPERATION,
    resource_type="email",
    thing="message",
    check_hint="your Sent folder",
    in_progress_code="SEND_IN_PROGRESS",
    unknown_code="SEND_OUTCOME_UNKNOWN",
    validation_error=gmail_service.MessageValidationError,
    validation_code="INVALID_RECIPIENT",
    permission_message="RevoMail needs permission to send email. Reconnect your Google account in Settings and tick the permission to send email.",
    api_name="Gmail API",
    enable_url="https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    not_found=("EMAIL_NOT_FOUND", "The message you are replying to could not be found."),
)


@router.post("/send")
async def send_email(
    payload: SendEmailRequest,
    request: Request,
    session=Depends(require_session),
    tokens: dict = Depends(require_tokens),
):
    """
    Send an email (or reply) from the connected Gmail account.

    The caller must confirm explicitly (`confirmed: true`) after reviewing the recipients, subject and body.
    Replies are addressed server-side from the original message. An idempotency key makes retries safe:
    repeating a request returns the original result instead of sending again.
    """
    if not payload.confirmed:
        raise AppError("CONFIRMATION_REQUIRED", "Review and confirm the message before sending.", 400)
    if not payload.replyToMessageId and not (payload.to or "").strip():
        raise AppError("INVALID_RECIPIENT", "Enter at least one valid recipient email address.", 422)

    digest = request_hash(
        {
            "to": (payload.to or "").strip(),
            "subject": payload.subject,
            "body": payload.body,
            "reply": payload.replyToMessageId,
        }
    )
    response, replayed = await execute_once(
        request,
        SEND_ONCE,
        session.user["id"],
        payload.idempotencyKey,
        digest,
        lambda: gmail_service.send_message(tokens, payload.to, payload.subject, payload.body, payload.replyToMessageId),
        lambda result: {"id": result["id"], "threadId": result["thread_id"]},
    )
    return {**response, "sent": True, "replayed": replayed}
