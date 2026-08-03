from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
import google.oauth2.credentials

from app.config import settings

router = APIRouter()

# Scopes we request from Google.
# gmail.readonly  — read emails
# gmail.send      — send replies
# calendar        — create calendar events
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
]


def _build_flow() -> Flow:
    """Create a Google OAuth flow from config settings."""
    return Flow.from_client_config(
        client_config={
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        },
        scopes=SCOPES,
        redirect_uri=settings.google_redirect_uri,
    )


# ---------------------------------------------------------------------------
# GET /api/auth/google
# Redirect the user to Google's consent screen.
# ---------------------------------------------------------------------------
@router.get("/google")
async def google_login(request: Request):
    flow = _build_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",   # get a refresh token so we can act later
        include_granted_scopes="true",
        prompt="consent",        # always show consent so we always get a refresh token
    )
    # Store the CSRF state in the session for validation on callback
    request.session["oauth_state"] = state
    return RedirectResponse(auth_url)


# ---------------------------------------------------------------------------
# GET /api/auth/google/callback
# Google redirects here after the user approves (or denies) access.
# ---------------------------------------------------------------------------
@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    # User denied access
    if error:
        return RedirectResponse(f"{settings.allowed_origins[0]}?auth_error={error}")

    # CSRF check
    stored_state = request.session.get("oauth_state")
    if not stored_state or stored_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch — possible CSRF attack.")

    # Exchange the authorisation code for tokens
    flow = _build_flow()
    flow.fetch_token(code=code)
    credentials = flow.credentials

    # Fetch basic profile info using the access token
    oauth2_service = build("oauth2", "v2", credentials=credentials)
    user_info = oauth2_service.userinfo().get().execute()

    # Store everything we need in the signed session cookie
    request.session["user"] = {
        "email": user_info.get("email"),
        "name": user_info.get("name"),
        "picture": user_info.get("picture"),
    }
    request.session["tokens"] = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": list(credentials.scopes or []),
    }

    # Redirect back to the frontend — it will call /api/auth/me to get user info
    return RedirectResponse(f"{settings.allowed_origins[0]}?auth=success")


# ---------------------------------------------------------------------------
# GET /api/auth/me
# Returns the logged-in user's profile, or 401 if not authenticated.
# Called by the frontend on page load to check session state.
# ---------------------------------------------------------------------------
@router.get("/me")
async def get_me(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# Clears the session.
# ---------------------------------------------------------------------------
@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged out"}
