import asyncio
import logging
from contextlib import suppress
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from backend.app.config import PROJECT_ROOT, Settings, settings
from backend.app.errors import AppError, error_payload
from backend.app.jobs import JobRepository
from backend.app.mailbox import MailboxRepository
from backend.app.persistence import build_persistence
from backend.app.routers import accounts, ai, auth, emails, health
from backend.app.services.mailbox import MailboxSyncService


logger = logging.getLogger("revomail.api")


def _error(request: Request, code: str, message: str, status_code: int, retryable: bool = False) -> JSONResponse:
    app_error = AppError(code=code, message=message, status_code=status_code, retryable=retryable)
    return JSONResponse(
        status_code=status_code,
        content=error_payload(request, app_error),
        headers={"X-Correlation-ID": request.state.correlation_id},
    )


def create_app(app_settings: Settings = settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database, auth_repository, oauth_repository = build_persistence(app_settings)
        app.state.database = database
        app.state.auth_repository = auth_repository
        app.state.oauth_transactions = oauth_repository
        app.state.job_repository = JobRepository(database, app_settings)
        app.state.job_repository.recover_interrupted()
        app.state.mailbox_repository = MailboxRepository(database, auth_repository.protector)
        app.state.mailbox_sync = MailboxSyncService(app.state.mailbox_repository, auth_repository, app.state.job_repository)
        app.state.settings = app_settings
        worker = asyncio.create_task(app.state.mailbox_sync.run())
        try:
            yield
        finally:
            app.state.mailbox_sync.stop()
            worker.cancel()
            with suppress(asyncio.CancelledError):
                await worker

    app = FastAPI(
        title="RevoMail API",
        version="0.2.0",
        docs_url="/api/docs" if app_settings.debug else None,
        redoc_url="/api/redoc" if app_settings.debug else None,
        lifespan=lifespan,
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=app_settings.secret_key,
        session_cookie="revomail_session",
        max_age=60 * 60 * 24 * 7,
        https_only=app_settings.app_base_url.startswith("https://"),
        same_site="lax",
    )

    @app.middleware("http")
    async def attach_correlation_id(request: Request, call_next):
        incoming = request.headers.get("X-Correlation-ID", "")
        request.state.correlation_id = incoming if 1 <= len(incoming) <= 128 and incoming.isascii() else str(uuid4())
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = request.state.correlation_id
        return response

    @app.exception_handler(AppError)
    async def application_error(request: Request, exc: AppError):
        return _error(request, exc.code, exc.message, exc.status_code, exc.retryable)

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
        code = "NOT_AUTHENTICATED" if exc.status_code == 401 else "REQUEST_FAILED"
        return _error(_request, code, detail, exc.status_code, exc.status_code >= 500)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exc: RequestValidationError):
        return _error(_request, "INVALID_REQUEST", "The request was invalid.", 422)

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, _exc: Exception):
        logger.error(
            "Unhandled API error correlation_id=%s error_type=%s",
            request.state.correlation_id,
            type(_exc).__name__,
        )
        return _error(request, "INTERNAL_ERROR", "The request could not be completed.", 500, True)

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
    app.include_router(emails.router, prefix="/api/v1/emails", tags=["emails"])
    app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])

    dist_path = PROJECT_ROOT / "dist"

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str, request: Request):
        candidate = (dist_path / path).resolve()
        if path and candidate.is_relative_to(dist_path.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        index = dist_path / "index.html"
        if index.is_file():
            return FileResponse(index)
        return _error(request, "FRONTEND_NOT_BUILT", "Run npm run build before starting RevoMail.", 503)

    return app


app = create_app()
