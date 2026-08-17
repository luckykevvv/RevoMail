from fastapi import APIRouter, HTTPException, Request

from backend.app.dependencies import require_session
from backend.app.routers.auth import _authorization


router = APIRouter()


@router.get("")
async def list_accounts(request: Request):
    session = require_session(request)
    return {"accounts": request.app.state.auth_repository.list_accounts(session.user["id"])}


@router.post("/{account_id}/reauthorize")
async def reauthorize(account_id: str, request: Request):
    session = require_session(request)
    accounts = request.app.state.auth_repository.list_accounts(session.user["id"])
    account = next((item for item in accounts if item["id"] == account_id), None)
    if not account or account["provider"] != "google":
        raise HTTPException(status_code=404, detail="Connected account not found.")
    return {"authorizationUrl": _authorization(request, "/?view=settings")}


@router.delete("/{account_id}", status_code=204)
async def disconnect(account_id: str, request: Request):
    session = require_session(request)
    if not request.app.state.auth_repository.disconnect(session.user["id"], account_id):
        raise HTTPException(status_code=404, detail="Connected account not found.")
