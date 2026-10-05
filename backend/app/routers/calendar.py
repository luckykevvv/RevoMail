from fastapi import APIRouter, Depends, Request

from backend.app.contracts import CalendarMutationRequest
from backend.app.dependencies import require_csrf, require_tokens
from backend.app.errors import AppError
from backend.app.idempotency import request_hash
from backend.app.once import OnceConfig, execute_once
from backend.app.services import calendar as calendar_service


router = APIRouter()

CREATE_ONCE = OnceConfig(
    operation="calendar.create",
    resource_type="calendar_event",
    thing="event",
    check_hint="your Google Calendar",
    in_progress_code="CALENDAR_IN_PROGRESS",
    unknown_code="CALENDAR_OUTCOME_UNKNOWN",
    validation_error=calendar_service.EventValidationError,
    validation_code="INVALID_EVENT",
    permission_message="RevoMail needs permission to use Google Calendar. Reconnect your Google account in Settings and tick the Calendar permission.",
    api_name="Google Calendar API",
    enable_url="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
)


@router.post("/events")
async def create_event(
    payload: CalendarMutationRequest,
    request: Request,
    session=Depends(require_csrf),
    tokens: dict = Depends(require_tokens),
):
    """
    Add an event to the user's primary Google Calendar.

    The caller must confirm explicitly (`confirmed: true`) after the user has reviewed the title, date, time and
    location. An idempotency key makes retries safe: repeating a request returns the original event instead of
    creating a duplicate.
    """
    if not payload.confirmed:
        raise AppError("CONFIRMATION_REQUIRED", "Review and confirm the event before adding it to your calendar.", 400)

    digest = request_hash(payload.model_dump(exclude={"confirmed", "idempotencyKey"}))
    response, replayed = await execute_once(
        request,
        CREATE_ONCE,
        session.user["id"],
        payload.idempotencyKey,
        digest,
        lambda: calendar_service.create_event(
            tokens,
            payload.title,
            payload.startsAt,
            payload.endsAt,
            payload.timezone,
            payload.allDay,
            payload.location,
            payload.description,
        ),
        lambda result: {"id": result["id"], "htmlLink": result["html_link"]},
    )
    return {**response, "created": True, "replayed": replayed}
