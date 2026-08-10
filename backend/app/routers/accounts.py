from fastapi import APIRouter, HTTPException, Request

from app.routers.auth import _authorization


router = APIRouter()


def _require_user(request: Request) -> None:
    if not request.session.get("user"):
        raise HTTPException(status_code=401, detail="Not authenticated.")


@router.get("")
async def list_accounts(request: Request):
    _require_user(request)
    account = request.session.get("account")
    return {"accounts": [account] if account else []}


@router.post("/{account_id}/reauthorize")
async def reauthorize(account_id: str, request: Request):
    _require_user(request)
    account = request.session.get("account")
    if account_id != "google" or not account:
        raise HTTPException(status_code=404, detail="Connected account not found.")
    return {"authorizationUrl": _authorization(request, "/?view=settings")}


@router.delete("/{account_id}", status_code=204)
async def disconnect(account_id: str, request: Request):
    _require_user(request)
    account = request.session.get("account")
    if not account or account_id != account.get("id"):
        raise HTTPException(status_code=404, detail="Connected account not found.")
    request.session.pop("tokens", None)
    request.session.pop("account", None)
