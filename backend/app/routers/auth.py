from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.config import settings
from app.services.oauth_transactions import oauth_transactions


router = APIRouter()

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
]


def _providers() -> dict[str, bool]:
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
        "microsoft": False,
    }


def _build_flow() -> Flow:
    if not _providers()["google"]:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    return Flow.from_client_config(
        client_config={
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.effective_google_redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.effective_google_redirect_uri,
    )


def _authorization(request: Request, return_to: str = "/") -> str:
    flow = _build_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    safe_return_to = return_to if return_to.startswith("/") and not return_to.startswith("//") else "/"
    oauth_transactions.put(state, safe_return_to)
    return authorization_url


@router.get("/session")
async def session(request: Request):
    user = request.session.get("user")
    return {
        "authenticated": bool(user),
        "user": user,
        "csrfToken": request.session.setdefault("csrf_token", "internal-project"),
        "providers": _providers(),
    }


@router.get("/{provider}/start")
async def provider_start(provider: str, request: Request, returnTo: str = "/"):
    if provider != "google":
        raise HTTPException(status_code=503, detail=f"{provider.title()} sign-in is pending.")
    return RedirectResponse(_authorization(request, returnTo))


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    frontend = settings.app_base_url.rstrip("/")
    transaction = oauth_transactions.consume(state)
    if error:
        return RedirectResponse(f"{frontend}/?authError=AUTHORIZATION_DENIED")
    if not code or transaction is None:
        return RedirectResponse(f"{frontend}/?authError=INVALID_OAUTH_STATE")

    try:
        flow = _build_flow()
        flow.fetch_token(code=code)
        credentials = flow.credentials
        profile = build("oauth2", "v2", credentials=credentials).userinfo().get().execute()
    except Exception:
        return RedirectResponse("/?authError=AUTHORIZATION_FAILED")

    user = {
        "id": profile.get("id") or profile.get("email"),
        "email": profile.get("email", ""),
        "displayName": profile.get("name") or profile.get("email", "RevoMail User"),
        "avatarUrl": profile.get("picture"),
    }
    request.session["user"] = user
    request.session["tokens"] = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": list(credentials.scopes or SCOPES),
    }
    request.session["account"] = {
        "id": "google",
        "provider": "google",
        "email": user["email"],
        "displayName": user["displayName"],
        "status": "CONNECTED",
        "scopes": request.session["tokens"]["scopes"],
    }
    return RedirectResponse(f"{frontend}{transaction.return_to}")


@router.post("/logout", status_code=204)
async def logout(request: Request):
    request.session.clear()
