import logging
import hashlib
import hmac
import os
import secrets
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from requests.adapters import HTTPAdapter
from requests.exceptions import ConnectionError as RequestsConnectionError
from requests.exceptions import Timeout as RequestsTimeout
from urllib3.util.retry import Retry

from backend.app.config import settings
from backend.app.dependencies import require_csrf, require_session

# Google's token response almost never echoes back the exact scope string we requested: it
# normalises "https://www.googleapis.com/auth/userinfo.email" to "email" (and similarly for
# "profile"), and it can also return scopes granted by an earlier authorization. oauthlib treats
# that mismatch as fatal by default. This relaxes the comparison to match Google's expected
# behaviour. It must be set before Flow.fetch_token() runs.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

router = APIRouter()
logger = logging.getLogger("revomail.api.oauth")

IDENTITY_SCOPES = ["openid", "email", "profile"]
GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
]
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
# Public compatibility name now represents identity-only sign-in.
SCOPES = IDENTITY_SCOPES


def normalise_scopes(scopes) -> set[str]:
    if isinstance(scopes, str):
        scopes = scopes.split()
    aliases = {"https://www.googleapis.com/auth/userinfo.email": "email",
               "https://www.googleapis.com/auth/userinfo.profile": "profile"}
    return {aliases.get(scope, scope) for scope in (scopes or [])}


def _safe_return_to(value: str) -> str:
    # Backslashes and control characters can be interpreted as external redirects by browsers.
    if not value.startswith("/") or value.startswith("//") or "\\" in value or any(ord(c) < 32 for c in value):
        return "/"
    parts = urlsplit(value)
    return urlunsplit(("", "", parts.path, parts.query, ""))


def _origin(url) -> tuple[str, str, int]:
    scheme = url.scheme.lower()
    return scheme, (url.hostname or "").lower(), url.port or (443 if scheme == "https" else 80)


def _request_origin_matches(request: Request) -> bool:
    try:
        return _origin(request.url) == _origin(urlsplit(request.app.state.settings.app_base_url))
    except ValueError:
        return False


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


def _build_flow(scopes=None, code_verifier=None) -> Flow:
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
        scopes=scopes or IDENTITY_SCOPES,
        redirect_uri=settings.effective_google_redirect_uri,
        code_verifier=code_verifier,
        autogenerate_code_verifier=False,
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


def _authorization(request: Request, return_to: str = "/", purpose: str = "signin", account_id: str | None = None) -> str:
    if not _request_origin_matches(request):
        raise HTTPException(status_code=409, detail="OAuth must start from the configured RevoMail origin.")
    context = {"purpose": purpose, "code_verifier": secrets.token_urlsafe(64), "scopes": list(IDENTITY_SCOPES)}
    options = {"access_type": "online"}
    if purpose != "signin":
        session = require_session(request)
        context.update(user_id=session.user["id"], session_hash=hashlib.sha256(session.token.encode()).hexdigest(), account_id=account_id)
        context["scopes"] += GMAIL_SCOPES
        if purpose == "calendar":
            context["scopes"].append(CALENDAR_SCOPE)
        options.update(access_type="offline", prompt="consent", include_granted_scopes="true", login_hint=session.user["email"])
    flow = _build_flow(context["scopes"], context["code_verifier"])
    authorization_url, state = flow.authorization_url(**options)
    request.app.state.oauth_transactions.put(state, _safe_return_to(return_to), context)
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
    if not _request_origin_matches(request):
        logger.warning("Google OAuth callback rejected correlation_id=%s code=OAUTH_ORIGIN_MISMATCH", request.state.correlation_id)
        return RedirectResponse("/?authError=OAUTH_ORIGIN_MISMATCH")
    transaction = request.app.state.oauth_transactions.consume(state)
    context = transaction.context if transaction else None
    if not context or context.get("purpose") not in {"signin", "gmail", "calendar"} or not context.get("code_verifier"):
        return RedirectResponse("/?authError=INVALID_OAUTH_STATE")

    def fail(code):
        logger.warning("Google authorisation incomplete correlation_id=%s purpose=%s code=%s", request.state.correlation_id, context["purpose"], code)
        return RedirectResponse(("/?view=settings&" if context["purpose"] != "signin" else "/?") + "authError=" + code)

    bound_session = None
    if context["purpose"] != "signin":
        try:
            bound_session = require_session(request)
        except HTTPException:
            return fail("INVALID_OAUTH_STATE")
        digest = hashlib.sha256(bound_session.token.encode()).hexdigest()
        if bound_session.user["id"] != context.get("user_id") or not hmac.compare_digest(digest, context.get("session_hash", "")):
            return fail("INVALID_OAUTH_STATE")
        if context.get("account_id") and not request.app.state.auth_repository.get_account_tokens(bound_session.user["id"], context["account_id"]):
            return fail("INVALID_OAUTH_STATE")
    if error:
        return fail("AUTHORIZATION_DENIED")
    if not code:
        return fail("INVALID_OAUTH_STATE")
    flow = _build_flow(context["scopes"], context["code_verifier"])
    try:
        flow.fetch_token(code=code, timeout=15)
    except (RequestsConnectionError, RequestsTimeout) as exc:
        logger.warning(
            "Google OAuth network failure correlation_id=%s stage=token_exchange error_types=%s",
            request.state.correlation_id,
            _error_type_chain(exc),
        )
        return fail("AUTHORIZATION_NETWORK_FAILED")
    except Warning as exc:
        logger.warning(
            "Google OAuth scope mismatch correlation_id=%s error_type=%s",
            request.state.correlation_id,
            type(exc).__name__,
        )
        return fail("AUTHORIZATION_SCOPE_MISMATCH")
    except Exception as exc:
        logger.warning(
            "Google OAuth callback failed correlation_id=%s stage=token_exchange error_type=%s",
            request.state.correlation_id,
            type(exc).__name__,
        )
        return fail("AUTHORIZATION_FAILED")

    credentials = flow.credentials
    try:
        profile = build("oauth2", "v2", credentials=credentials).userinfo().get().execute(num_retries=2)
    except (RequestsConnectionError, RequestsTimeout) as exc:
        logger.warning(
            "Google OAuth network failure correlation_id=%s stage=userinfo error_types=%s",
            request.state.correlation_id,
            _error_type_chain(exc),
        )
        return fail("AUTHORIZATION_NETWORK_FAILED")
    except Exception as exc:
        logger.warning(
            "Google OAuth callback failed correlation_id=%s stage=userinfo error_type=%s",
            request.state.correlation_id,
            type(exc).__name__,
        )
        return fail("AUTHORIZATION_FAILED")

    user = {
        "id": profile.get("id"),
        "email": profile.get("email", ""),
        "displayName": profile.get("name") or profile.get("email", "RevoMail User"),
        "avatarUrl": profile.get("picture"),
    }
    if not user["id"] or not user["email"]:
        return fail("AUTHORIZATION_FAILED")
    repository = request.app.state.auth_repository
    if context["purpose"] == "signin":
        user_id = repository.save_identity(user)
        repository.delete_session(request.session.get("session_token"))
        request.session.clear()
        request.session["csrf_token"] = secrets.token_urlsafe(32)
        request.session["session_token"] = repository.create_session(user_id, request.session["csrf_token"])
        return RedirectResponse(transaction.return_to)

    if str(user["id"]) != bound_session.user["id"]:
        return fail("ACCOUNT_MISMATCH")
    # credentials.scopes describes the request, not necessarily the scopes actually granted.
    granted = normalise_scopes(getattr(credentials, "granted_scopes", None))
    required = set(GMAIL_SCOPES)
    previous = repository.get_primary_mailbox(bound_session.user["id"])
    if context["purpose"] == "calendar" and not granted.intersection({CALENDAR_SCOPE, "https://www.googleapis.com/auth/calendar"}):
        return fail("INSUFFICIENT_PERMISSIONS")
    # Validate the requested feature, not every permission held by an older
    # credential. Optional Calendar access must not prevent Gmail recovery.
    if not required.issubset(granted):
        return fail("INSUFFICIENT_PERMISSIONS")
    tokens = {
        "token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "token_uri": credentials.token_uri,
        "client_id": credentials.client_id,
        "client_secret": credentials.client_secret,
        "scopes": sorted(granted),
    }
    if not tokens["refresh_token"] and previous and previous[1].get("client_id") == tokens["client_id"]:
        tokens["refresh_token"] = previous[1].get("refresh_token")
    _user_id, connection_id = repository.save_authorized_account(
        user,
        "google",
        tokens["scopes"],
        tokens,
    )
    sync_state = request.app.state.mailbox_repository.sync_state(connection_id)
    if sync_state["status"] == "failed" and sync_state.get("errorCode") in {"AUTHORIZATION_EXPIRED", "MAILBOX_NOT_CONNECTED", "INSUFFICIENT_PERMISSIONS"}:
        # Clear the old credential failure without claiming a successful sync or
        # removing cached messages/history. Frontend bootstrap enqueues the sync.
        request.app.state.mailbox_repository.set_sync_state(connection_id, status="idle", error_code=None, job_id=None)
    separator = "&" if "?" in transaction.return_to else "?"
    return RedirectResponse(f"{transaction.return_to}{separator}connected={context['purpose']}")


@router.post("/logout", status_code=204)
async def logout(request: Request):
    require_csrf(request)
    request.app.state.auth_repository.delete_session(request.session.get("session_token"))
    request.session.clear()
