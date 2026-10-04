import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.concurrency import run_in_threadpool
from googleapiclient.errors import HttpError

from backend.app.contracts import SendEmailRequest
from backend.app.dependencies import require_session, require_tokens
from backend.app.errors import AppError, ProviderError, correlation_id
from backend.app.idempotency import request_hash
from backend.app.services import gmail as gmail_service


router = APIRouter()
logger = logging.getLogger("revomail.emails")

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


def _http_status(exc: HttpError) -> int | None:
    return getattr(exc, "status_code", None) or getattr(getattr(exc, "resp", None), "status", None)


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

    user_id = session.user["id"]
    cid = correlation_id(request)
    idempotency = request.app.state.idempotency
    audit = request.app.state.audit

    digest = request_hash(
        {
            "to": (payload.to or "").strip(),
            "subject": payload.subject,
            "body": payload.body,
            "reply": payload.replyToMessageId,
        }
    )
    decision = idempotency.begin(payload.idempotencyKey, user_id, SEND_OPERATION, digest)
    if decision.state == "replay":
        return {**(decision.response or {}), "sent": True, "replayed": True}
    if decision.state == "mismatch":
        raise AppError("IDEMPOTENCY_KEY_REUSED", "This send request key was already used for a different message.", 409)
    if decision.state == "in_progress":
        raise AppError("SEND_IN_PROGRESS", "This message is already being sent.", 409, True)
    if decision.state == "unknown":
        raise AppError(
            "SEND_OUTCOME_UNKNOWN",
            "An earlier attempt to send this message did not finish. Check your Sent folder before sending it again.",
            409,
        )

    def fail(outcome: str) -> None:
        audit.record(user_id, SEND_OPERATION, "email", None, outcome, cid)

    try:
        result = await run_in_threadpool(
            gmail_service.send_message,
            tokens,
            payload.to,
            payload.subject,
            payload.body,
            payload.replyToMessageId,
        )
    except gmail_service.MessageValidationError as exc:
        idempotency.release(payload.idempotencyKey, user_id, SEND_OPERATION)
        fail("REJECTED")
        raise AppError("INVALID_RECIPIENT", str(exc), 422) from exc
    except HttpError as exc:
        status = _http_status(exc)
        if status is not None and status >= 500:
            # Gmail may have accepted the message before failing — never auto-repeat it.
            idempotency.mark_unknown(payload.idempotencyKey, user_id, SEND_OPERATION)
            fail("UNKNOWN")
            raise ProviderError(
                "SEND_OUTCOME_UNKNOWN",
                "Gmail did not confirm the message was sent. Check your Sent folder before sending it again.",
                502,
            ) from exc
        idempotency.release(payload.idempotencyKey, user_id, SEND_OPERATION)
        fail("FAILED")
        if status == 403:
            raise AppError(
                "INSUFFICIENT_PERMISSIONS",
                "RevoMail needs permission to send email. Reconnect your Google account in Settings.",
                403,
            ) from exc
        if status == 404:
            raise AppError("EMAIL_NOT_FOUND", "The message you are replying to could not be found.", 404) from exc
        raise ProviderError("EMAIL_PROVIDER_FAILED", "The mailbox provider could not complete the request.", 502, True) from exc
    except Exception as exc:
        # Timeouts and unexpected failures: the message may already have been sent.
        idempotency.mark_unknown(payload.idempotencyKey, user_id, SEND_OPERATION)
        fail("UNKNOWN")
        logger.error("Email send outcome unknown correlation_id=%s error_type=%s", cid, type(exc).__name__)
        raise ProviderError(
            "SEND_OUTCOME_UNKNOWN",
            "Gmail did not confirm the message was sent. Check your Sent folder before sending it again.",
            502,
        ) from exc

    response = {"id": result["id"], "threadId": result["thread_id"]}
    idempotency.complete(payload.idempotencyKey, user_id, SEND_OPERATION, response)
    audit.record(user_id, SEND_OPERATION, "email", result["id"], "SUCCEEDED", cid)
    return {**response, "sent": True, "replayed": False}
