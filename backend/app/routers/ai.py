from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.services import ai as ai_service
from app.services import gmail as gmail_service

router = APIRouter()


def _require_tokens(request: Request) -> dict:
    tokens = request.session.get("tokens")
    if not tokens:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return tokens


class EmailRef(BaseModel):
    message_id: str
    tone: str = "professional"   # used only by /draft-reply


def _get_email_text(tokens: dict, message_id: str) -> dict:
    """Fetch a message and return its subject, sender, and plain body."""
    msg = gmail_service.get_message(tokens, message_id)
    body = msg.get("body_plain") or ""
    # Fall back to stripping tags from HTML if no plain text
    if not body and msg.get("body_html"):
        import re
        body = re.sub(r"<[^>]+>", " ", msg["body_html"])
    return {
        "subject": msg.get("subject", ""),
        "sender": msg.get("sender", ""),
        "body": body,
    }


# ---------------------------------------------------------------------------
# POST /api/ai/summarise
# ---------------------------------------------------------------------------
@router.post("/summarise")
async def summarise(payload: EmailRef, tokens: dict = Depends(_require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        result = await run_in_threadpool(
            ai_service.summarise, email["subject"], email["sender"], email["body"]
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /api/ai/draft-reply
# ---------------------------------------------------------------------------
@router.post("/draft-reply")
async def draft_reply(payload: EmailRef, tokens: dict = Depends(_require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        draft = await run_in_threadpool(
            ai_service.draft_reply,
            email["subject"], email["sender"], email["body"], payload.tone,
        )
        return {"draft": draft}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /api/ai/extract
# ---------------------------------------------------------------------------
@router.post("/extract")
async def extract(payload: EmailRef, tokens: dict = Depends(_require_tokens)):
    try:
        email = await run_in_threadpool(_get_email_text, tokens, payload.message_id)
        result = await run_in_threadpool(
            ai_service.extract, email["subject"], email["sender"], email["body"]
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
