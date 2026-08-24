import hashlib
import hmac

from fastapi import HTTPException, Request

from backend.app.persistence import AuthenticatedSession


def require_session(request: Request) -> AuthenticatedSession:
    token = request.session.get("session_token")
    session = request.app.state.auth_repository.find_session(token)
    if not session:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return session


def require_tokens(request: Request) -> dict:
    session = require_session(request)
    tokens = request.app.state.auth_repository.get_tokens(session.user["id"])
    if not tokens:
        raise HTTPException(status_code=401, detail="No connected mailbox is available.")
    return tokens


def require_csrf(request: Request) -> AuthenticatedSession:
    session = require_session(request)
    supplied = request.headers.get("X-CSRF-Token", "")
    supplied_hash = hashlib.sha256(supplied.encode("utf-8")).hexdigest() if supplied else ""
    if not session.csrf_hash or not hmac.compare_digest(session.csrf_hash, supplied_hash):
        raise HTTPException(status_code=403, detail="The security token was missing or invalid.")
    return session


def require_account(request: Request, account_id: str) -> tuple[AuthenticatedSession, dict, dict]:
    session = require_session(request)
    result = request.app.state.auth_repository.get_account_tokens(session.user["id"], account_id)
    if not result:
        raise HTTPException(status_code=404, detail="The connected mailbox was not found.")
    account, tokens = result
    return session, account, tokens


def require_mailbox(request: Request) -> tuple[AuthenticatedSession, dict, dict]:
    session = require_session(request)
    result = request.app.state.auth_repository.get_primary_mailbox(session.user["id"])
    if not result:
        raise HTTPException(status_code=401, detail="No connected Gmail mailbox is available.")
    account, tokens = result
    return session, account, tokens
