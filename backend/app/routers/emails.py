from fastapi import APIRouter, Query, Request
from fastapi.concurrency import run_in_threadpool

from backend.app.contracts import MessageStateMutation, SendEmailRequest
from backend.app.dependencies import require_csrf, require_mailbox
from backend.app.errors import AppError
from backend.app.services.gmail import GmailAdapter, InvalidAuthorization, MailProviderError, ProviderRateLimited, ProviderTimeout


router = APIRouter()
GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify"


def _provider_error(exc: MailProviderError) -> AppError:
    if isinstance(exc, InvalidAuthorization):
        return AppError(exc.code, "Gmail authorization expired. Reconnect the account and try again.", 401, False)
    if isinstance(exc, ProviderRateLimited):
        return AppError(exc.code, "Gmail is temporarily rate limiting requests.", 429, True)
    if isinstance(exc, ProviderTimeout):
        return AppError(exc.code, "Gmail did not respond in time.", 504, True)
    return AppError(exc.code, "Gmail could not complete the request.", 502, True)


def _require_modify_scope(account: dict) -> None:
    if GMAIL_MODIFY_SCOPE not in account.get("scopes", []):
        raise AppError("INSUFFICIENT_PERMISSIONS", "Reconnect Google to grant mailbox update permission.", 403, False)


def _legacy_summary(item: dict) -> dict:
    return {
        **item,
        "thread_id": item.get("threadId"),
        "to": ", ".join(item.get("recipients") or []),
        "date": item.get("receivedAt"),
    }


def _legacy_detail(item: dict) -> dict:
    return {
        **_legacy_summary(item),
        "body_plain": item.get("bodyText", ""),
        "body_html": item.get("bodyHtmlSafe") or None,
        "body_html_clean": item.get("bodyHtmlSafe") or None,
    }


@router.get("")
async def list_emails(
    request: Request,
    max_results: int = Query(default=20, ge=1, le=100),
    page_token: str | None = Query(default=None),
    query: str = Query(default="", max_length=500),
    category: str | None = Query(default=None, max_length=50),
    unread: bool | None = None,
    starred: bool | None = None,
):
    _session, account, tokens = require_mailbox(request)
    repository = request.app.state.mailbox_repository
    if query.strip():
        try:
            page = await run_in_threadpool(
                GmailAdapter(tokens).list_messages, min(max_results, 50), page_token, query.strip(), ["INBOX"],
            )
            await run_in_threadpool(repository.upsert_messages, account["id"], page["items"])
        except MailProviderError as exc:
            raise _provider_error(exc) from exc
        items = page["items"]
        if category:
            items = [item for item in items if item.get("category") == category]
        if unread is not None:
            items = [item for item in items if bool(item.get("unread")) is unread]
        if starred is not None:
            items = [item for item in items if bool(item.get("starred")) is starred]
        return {
            "messages": [_legacy_summary(item) for item in items],
            "next_page_token": page.get("nextCursor"),
            "sync": repository.sync_state(account["id"]),
        }
    try:
        cached = await run_in_threadpool(
            repository.list_messages, account["id"], max_results, page_token, query, category, unread, starred,
        )
    except ValueError as exc:
        raise AppError("INVALID_CURSOR", "The mailbox cursor was invalid.", 422) from exc
    return {
        "messages": [_legacy_summary(item) for item in cached["items"]],
        "next_page_token": cached["page"]["nextCursor"],
        "sync": repository.sync_state(account["id"]),
    }


@router.post("/sync", status_code=202)
async def start_sync(request: Request):
    session = require_csrf(request)
    _session, account, _tokens = require_mailbox(request)
    job_id = request.app.state.mailbox_sync.enqueue(session.user["id"], account["id"])
    return {"jobId": job_id, "status": request.app.state.mailbox_repository.sync_state(account["id"])["status"]}


@router.get("/sync/{job_id}")
async def sync_status(job_id: str, request: Request):
    _session, account, _tokens = require_mailbox(request)
    job = request.app.state.job_repository.status(job_id)
    if not job:
        raise AppError("SYNC_NOT_FOUND", "The synchronization operation was not found.", 404)
    return {"jobId": job_id, "job": job, "sync": request.app.state.mailbox_repository.sync_state(account["id"])}


@router.post("/send")
async def send_email(payload: SendEmailRequest, request: Request):
    session = require_csrf(request)
    _session, account, tokens = require_mailbox(request)
    _require_modify_scope(account)
    repository = request.app.state.mailbox_repository
    operation = "send:gmail"
    request_data = payload.model_dump(exclude={"idempotencyKey"})
    claim = repository.claim_idempotency(
        session.user["id"], payload.idempotencyKey, operation, request_data,
        request.app.state.settings.mail_send_limit_per_minute,
    )
    if claim.state == "CONFLICT":
        raise AppError("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for different content.", 409)
    if claim.state == "RATE_LIMITED":
        raise AppError("SEND_RATE_LIMITED", "Too many email sends were attempted. Wait before trying again.", 429, True)
    if claim.state in {"SENT", "FAILED", "UNKNOWN"}:
        return claim.response
    if claim.state == "STARTED":
        response = {"operationId": payload.idempotencyKey, "status": "unknown"}
        repository.finish_idempotency(session.user["id"], payload.idempotencyKey, operation, "UNKNOWN", response)
        repository.audit(session.user["id"], "email.send", None, "UNKNOWN", request.state.correlation_id)
        return response
    try:
        sent = await run_in_threadpool(GmailAdapter(tokens).send_message, request_data)
        response = {"operationId": payload.idempotencyKey, "status": "sent", **sent}
        status = "SENT"
    except ProviderTimeout:
        response = {"operationId": payload.idempotencyKey, "status": "unknown"}
        status = "UNKNOWN"
    except MailProviderError:
        response = {"operationId": payload.idempotencyKey, "status": "failed"}
        status = "FAILED"
    repository.finish_idempotency(session.user["id"], payload.idempotencyKey, operation, status, response)
    repository.audit(session.user["id"], "email.send", response.get("providerMessageId"), status, request.state.correlation_id)
    return response


@router.patch("/{message_id}")
async def update_email(message_id: str, payload: MessageStateMutation, request: Request):
    require_csrf(request)
    _session, account, tokens = require_mailbox(request)
    _require_modify_scope(account)
    try:
        await run_in_threadpool(GmailAdapter(tokens).modify_message, message_id, payload.unread, payload.starred)
        await run_in_threadpool(request.app.state.mailbox_repository.update_flags, account["id"], message_id, payload.unread, payload.starred)
    except MailProviderError as exc:
        raise _provider_error(exc) from exc
    return {"id": message_id, "unread": payload.unread, "starred": payload.starred}


@router.get("/{message_id}")
async def get_email(message_id: str, request: Request):
    _session, account, tokens = require_mailbox(request)
    repository = request.app.state.mailbox_repository
    message = await run_in_threadpool(repository.get_message, account["id"], message_id)
    if message:
        return _legacy_detail(message)
    try:
        provider_message = await run_in_threadpool(GmailAdapter(tokens).get_message, message_id)
        await run_in_threadpool(repository.upsert_messages, account["id"], [provider_message])
        message = await run_in_threadpool(repository.get_message, account["id"], message_id)
        return _legacy_detail(message)
    except MailProviderError as exc:
        raise _provider_error(exc) from exc
