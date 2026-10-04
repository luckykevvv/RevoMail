"""
Run an action with a side effect outside RevoMail (sending mail, creating a calendar event) at most once
per idempotency key, and leave an audit record. Used by the email-send and calendar-create routes.
"""

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Request
from fastapi.concurrency import run_in_threadpool
from googleapiclient.errors import HttpError

from backend.app.errors import AppError, ProviderError, correlation_id


@dataclass(frozen=True)
class OnceConfig:
    operation: str  # idempotency/audit operation name, e.g. "email.send"
    resource_type: str  # audit resource type, e.g. "email"
    thing: str  # "message" / "event" — used in user-facing text
    check_hint: str  # where to look if the outcome is unknown, e.g. "your Sent folder"
    in_progress_code: str
    unknown_code: str
    validation_error: type[Exception]
    validation_code: str
    permission_message: str
    not_found: tuple[str, str] | None = None  # (code, message) for a Google 404
    api_name: str = "Google API"  # e.g. "Google Calendar API", used when the API is not enabled for the project
    enable_url: str = ""  # Google Cloud console page where that API is enabled


def _http_status(exc: HttpError) -> int | None:
    return getattr(exc, "status_code", None) or getattr(getattr(exc, "resp", None), "status", None)


def google_error_reasons(exc: HttpError) -> set[str]:
    """Machine-readable reason codes from a Google API error (e.g. accessNotConfigured), never the message."""
    reasons: set[str] = set()
    try:
        error = json.loads(exc.content.decode("utf-8", errors="replace")).get("error", {})
    except Exception:
        return reasons
    if not isinstance(error, dict):
        return reasons
    for item in error.get("errors") or []:
        if isinstance(item, dict) and item.get("reason"):
            reasons.add(str(item["reason"]))
    for item in error.get("details") or []:
        if isinstance(item, dict) and item.get("reason"):
            reasons.add(str(item["reason"]))
    if error.get("status"):
        reasons.add(str(error["status"]))
    return reasons


# Google reasons meaning "the API itself is switched off for RevoMail's Google Cloud project".
_API_DISABLED_REASONS = {"accessNotConfigured", "SERVICE_DISABLED", "API_DISABLED"}


async def execute_once(
    request: Request,
    config: OnceConfig,
    user_id: str,
    key: str,
    payload_hash: str,
    call: Callable[[], dict],
    to_response: Callable[[dict], dict],
) -> tuple[dict, bool]:
    """
    Returns (response, replayed). `call` performs the provider action (it runs in a worker thread) and
    `to_response` turns its result into the small, content-free dict that is stored for replays.
    """
    cid = correlation_id(request)
    idempotency = request.app.state.idempotency
    audit = request.app.state.audit
    op = config.operation

    decision = idempotency.begin(key, user_id, op, payload_hash)
    if decision.state == "replay":
        return decision.response or {}, True
    if decision.state == "mismatch":
        raise AppError("IDEMPOTENCY_KEY_REUSED", f"This request key was already used for a different {config.thing}.", 409)
    if decision.state == "in_progress":
        raise AppError(config.in_progress_code, f"This {config.thing} is already being processed.", 409, True)
    if decision.state == "unknown":
        raise AppError(
            config.unknown_code,
            f"An earlier attempt did not finish. Check {config.check_hint} before trying again.",
            409,
        )

    def record(outcome: str, resource_id: str | None = None) -> None:
        audit.record(user_id, op, config.resource_type, resource_id, outcome, cid)

    def uncertain() -> ProviderError:
        idempotency.mark_unknown(key, user_id, op)
        record("UNKNOWN")
        return ProviderError(
            config.unknown_code,
            f"Google did not confirm the {config.thing} was completed. Check {config.check_hint} before trying again.",
            502,
        )

    try:
        result = await run_in_threadpool(call)
    except config.validation_error as exc:
        idempotency.release(key, user_id, op)
        record("REJECTED")
        raise AppError(config.validation_code, str(exc), 422) from exc
    except HttpError as exc:
        status = _http_status(exc)
        if status is not None and status >= 500:
            # The provider may have accepted the request before failing — never auto-repeat it.
            raise uncertain() from exc
        idempotency.release(key, user_id, op)
        record("FAILED")
        reasons = google_error_reasons(exc)
        logging.getLogger("revomail.once").warning(
            "Google API error operation=%s correlation_id=%s status=%s reasons=%s", op, cid, status, sorted(reasons)
        )
        if status == 403 and reasons & _API_DISABLED_REASONS:
            where = f" Enable it at {config.enable_url}, wait a minute, then try again." if config.enable_url else ""
            raise AppError(
                "GOOGLE_API_NOT_ENABLED",
                f"The {config.api_name} is not enabled for RevoMail's Google Cloud project.{where}",
                403,
            ) from exc
        if status == 403:
            raise AppError("INSUFFICIENT_PERMISSIONS", config.permission_message, 403) from exc
        if status == 404 and config.not_found:
            raise AppError(config.not_found[0], config.not_found[1], 404) from exc
        raise ProviderError("EMAIL_PROVIDER_FAILED", "The mailbox provider could not complete the request.", 502, True) from exc
    except Exception as exc:
        # Timeouts and unexpected failures: the action may already have happened.
        logging.getLogger("revomail.once").error(
            "Outcome unknown operation=%s correlation_id=%s error_type=%s", op, cid, type(exc).__name__
        )
        raise uncertain() from exc

    response = to_response(result)
    idempotency.complete(key, user_id, op, response)
    record("SUCCEEDED", response.get("id"))
    return response, False
