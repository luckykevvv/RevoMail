from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import PROJECT_ROOT, settings
from app.routers import accounts, ai, auth, emails, health


def _error(code: str, message: str, status_code: int, retryable: bool = False) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "retryable": retryable}},
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="RevoMail API",
        version="0.2.0",
        docs_url="/api/docs" if settings.debug else None,
        redoc_url="/api/redoc" if settings.debug else None,
    )
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.secret_key,
        session_cookie="revomail_session",
        max_age=60 * 60 * 24 * 7,
        https_only=settings.app_base_url.startswith("https://"),
        same_site="lax",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException):
        detail = exc.detail if isinstance(exc.detail, str) else "The request could not be completed."
        return _error("REQUEST_FAILED", detail, exc.status_code, exc.status_code >= 500)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exc: RequestValidationError):
        return _error("INVALID_REQUEST", "The request was invalid.", 422)

    app.include_router(health.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
    app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
    app.include_router(emails.router, prefix="/api/v1/emails", tags=["emails"])
    app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])

    dist_path = PROJECT_ROOT / "dist"

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        candidate = (dist_path / path).resolve()
        if path and candidate.is_relative_to(dist_path.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        index = dist_path / "index.html"
        if index.is_file():
            return FileResponse(index)
        return _error("FRONTEND_NOT_BUILT", "Run npm run build before starting RevoMail.", 503)

    return app


app = create_app()
