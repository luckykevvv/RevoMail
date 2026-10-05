import logging
import os
import secrets

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from requests.adapters import HTTPAdapter
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import Timeout as RequestsTimeout
from urllib3.util.retry import Retry

from backend.app.config import settings
from backend.app.dependencies import require_csrf

# Google's token response almost never echoes back the exact scope string we requested: it
# normalises "https://www.googleapis.com/auth/userinfo.email" to "email" (and similarly for
# "profile"), and it can also return scopes granted by an earlier authorization. oauthlib treats
# that mismatch as fatal by default. This relaxes the comparison to match Google's expected
# behaviour. It must be set before Flow.fetch_token() runs.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

router = APIRouter()
logger = logging.getLogger("revomail.api.oauth")

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]


def _providers() -> dict[str, bool]:
    return {"google": bool(settings.google_client_id and settings.google_client_secret)}


def _error_type_chain(exc: BaseException) -> str:
    names: list[str] = []
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen and len(names) < 6:
        seen.add(id(current))
        names.append(type(current).__name__)
        current = current.__cause__ or current.__context__
    return ">".join(names)


def _build_flow() -> Flow:
    if not _providers()["google"]:
        raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
    flow = Flow.from_client_config(
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
    # Retry only failures that occur while establishing a connection. Read retries stay disabled:
    # once Google may have consumed an authorization code, automatically replaying the POST could
    # turn an uncertain result into invalid_grant and hide the original failure.
    retry_policy = Retry(
        total=2,
        connect=2,
        read=0,
        status=0,
        other=0,
        allowed_methods=frozenset({"GET", "POST"}),
        backoff_factor=0.25,
    )
    flow.oauth2session.mount("https://", HTTPAdapter(max_retries=retry_policy))
    return flow


def _authorization(request: Request, return_to: str = "/") -> str:
    flow = _build_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        prompt="consent",
    )
    safe_return_to = return_to if return_to.startswith("/") and not return_to.startswith("//") else "/"
    request.app.state.oauth_transactions.put(state, safe_return_to)
    return authorization_url


@router.get("/session")
async def session(request: Request):
    authenticated_session = request.app.state.auth_repository.find_session(request.session.get("session_token"))
    if not authenticated_session:
        request.session.pop("session_token", None)
    elif not request.session.get("csrf_token") or not authenticated_session.csrf_hash:
        request.session["csrf_token"] = secrets.token_urlsafe(32)
        request.app.state.auth_repository.set_csrf(authenticated_session.token, request.session["csrf_token"])
    return {
        "authenticated": bool(authenticated_session),
        "user": authenticated_session.user if authenticated_session else None,
        "csrfToken": request.session.get("csrf_token", ""),
        "providers": _providers(),
    }


@router.get("/google/start")
async def provider_start(request: Request, returnTo: str = "/"):
    return RedirectResponse(_authorization(request, returnTo))


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    transaction = request.app.state.oauth_transactions.consume(state)
    if error:
        return RedirectResponse("/?authError=AUTHORIZATION_DENIED")
    if not code or transaction is None:
        return RedirectResponse("/?authError=INVALID_OAUTH_STATE")

    flow = _build_flow()
    try:
        flow.fetch_token(code=code, timeout=15)
    except (RequestsConnectionError, RequestsTimeout) as exc:
        logger.warning(
            "Google OAuth network failure correlation_id=%s stage=token_exchange error_types=%s",
            request.state.correlation_id,
            _error_type_chain(exc),
        )
        return RedirectResponse("/?authError=AUTHORIZATION_NETWORK_FAILED")
    except Warning as exc:
        logger.warning(
            "Google OAuth scope mismatch correlation_id=%s error_type=%s",
            request.state.correlation_id,
            type(exc).__name__,
        )
        return RedirectResponse("/?authError=AUTHORIZATION_SCOPE_MISMATCH")
    except Exception as exc:
        logger.warning(
            "Google OAuth callback failed correlation_id=%s stage=token_exchange error_type=%s",
            request.state.correlation_id,
            type(exc).__name__,
        )
        return RedirectResponse("/?authError=AUTHORIZATION_FAILED")

    credentials = flow.credentials
    try:
        profile = build("oauth2", "v2", credentials=credentials).userinfo().get().execute(num_retries=2)
    except (RequestsConnectionError, RequestsTimeout) as exc:
        logger.warning(
            "Google OAuth network failure correlation_id=%s stage=userinfo error_types=%s",
            request.state.correlation_id,
            _error_type_chain(exc),
        )
        return RedirectResponse("/?authError=AUTHORIZATION_NETWORK_FAILED")
    except Exception as exc:
        logger.warning(
            "Google OAuth callback failed correlation_id=%s stage=userinfo error_type=%s",
            request.state.correlation_id,
            type(exc).__name__,
        )
        return RedirectResponse("/?authError=AUTHORIZATION_FAILED")

    user = {
        "id": profile.get("id") or profile.get("email"),
        "email": profile.get("email", ""),
        "displayName": profile.get("name") or profile.get("email", "RevoMail User"),
        "avatarUrl": profile.get("picture"),
    }
    tokens = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": list(credentials.scopes or SCOPES),
    }
    user_id, _connection_id = request.app.state.auth_repository.save_authorized_account(
        user,
        "google",
        tokens["scopes"],
        tokens,
    )
    request.session.clear()
    request.session["csrf_token"] = secrets.token_urlsafe(32)
    request.session["session_token"] = request.app.state.auth_repository.create_session(user_id, request.session["csrf_token"])
    return RedirectResponse(transaction.return_to)


@router.post("/logout", status_code=204)
async def logout(request: Request):
    require_csrf(request)
    request.app.state.auth_repository.delete_session(request.session.get("session_token"))
    request.session.clear()
