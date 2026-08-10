from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool

from app.services import gmail as gmail_service

router = APIRouter()


def _require_tokens(request: Request) -> dict:
    """Dependency — pull stored OAuth tokens from the session or raise 401."""
    tokens = request.session.get("tokens")
    if not tokens:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return tokens


# ---------------------------------------------------------------------------
# GET /api/emails
# Returns a paginated list of inbox messages (metadata only, no bodies).
# ---------------------------------------------------------------------------
@router.get("")
async def list_emails(
    tokens: dict = Depends(_require_tokens),
    max_results: int = Query(default=20, ge=1, le=100),
    page_token: str | None = Query(default=None),
):
    try:
        return await run_in_threadpool(gmail_service.list_messages, tokens, max_results, page_token)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gmail API error: {exc}")


# ---------------------------------------------------------------------------
# GET /api/emails/{message_id}
# Returns the full content of a single message including sanitised body.
# ---------------------------------------------------------------------------
@router.get("/{message_id}")
async def get_email(
    message_id: str,
    tokens: dict = Depends(_require_tokens),
):
    try:
        return await run_in_threadpool(gmail_service.get_message, tokens, message_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gmail API error: {exc}")
