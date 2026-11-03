from fastapi import APIRouter, HTTPException, Request

from backend.app.dependencies import require_csrf, require_session
from backend.app.errors import AppError
from backend.app.routers.auth import _authorization
from backend.app.services.google_revocation import revoke_google_token


router = APIRouter()


@router.post("/google/connect")
async def connect_google(request: Request):
    require_csrf(request)
    return {"authorizationUrl": _authorization(request, "/?view=settings", "gmail")}


@router.post("/{account_id}/authorize-calendar")
async def authorize_calendar(account_id: str, request: Request):
    session = require_csrf(request)
    result = request.app.state.auth_repository.get_account_tokens(session.user["id"], account_id)
    if not result or result[0]["provider"] != "google":
        raise HTTPException(status_code=404, detail="Connected account not found.")
    return {"authorizationUrl": _authorization(request, "/?view=settings", "calendar", account_id)}


@router.get("")
async def list_accounts(request: Request):
    session = require_session(request)
    return {"accounts": request.app.state.auth_repository.list_accounts(session.user["id"])}


@router.post("/{account_id}/reauthorize")
async def reauthorize(account_id: str, request: Request):
    session = require_csrf(request)
    accounts = request.app.state.auth_repository.list_accounts(session.user["id"])
    account = next((item for item in accounts if item["id"] == account_id), None)
    if not account or account["provider"] != "google":
        raise HTTPException(status_code=404, detail="Connected account not found.")
    return {"authorizationUrl": _authorization(request, "/?view=settings", "gmail", account_id)}


@router.delete("/{account_id}", status_code=204)
async def disconnect(account_id: str, request: Request):
    session = require_csrf(request)
    if not request.app.state.auth_repository.disconnect(session.user["id"], account_id):
        raise HTTPException(status_code=404, detail="Connected account not found.")


@router.post("/{account_id}/revoke", status_code=204)
async def revoke_google_access(account_id: str, request: Request):
    session = require_csrf(request)
    result = request.app.state.auth_repository.get_account_tokens(session.user["id"], account_id)
    if not result or result[0]["provider"] != "google":
        raise AppError(
            "GOOGLE_REVOCATION_UNAVAILABLE",
            "No local Google credential is available for this account. Remove RevoMail access in Google Account settings.",
            404,
        )
    _account, tokens = result
    token = tokens.get("refresh_token") or tokens.get("token")
    if not isinstance(token, str) or not token:
        raise AppError(
            "GOOGLE_REVOCATION_UNAVAILABLE",
            "No local Google token is available. Remove RevoMail access in Google Account settings.",
            409,
        )

    await revoke_google_token(token)
    if not request.app.state.auth_repository.disconnect(session.user["id"], account_id):
        raise AppError(
            "LOCAL_DISCONNECT_FAILED",
            "Google access was revoked, but local cleanup was not completed. Use Disconnect Gmail and try again.",
            500,
            True,
        )
