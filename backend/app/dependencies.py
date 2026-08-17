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
