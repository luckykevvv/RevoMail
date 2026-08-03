from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from app.config import settings
from app.routers import health, auth, emails, ai

app = FastAPI(
    title="RevoMail API",
    version="0.1.0",
    # Hide docs in production
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
)

# ---------------------------------------------------------------------------
# Session middleware — must be added before CORS
# Signs the session cookie with SECRET_KEY so it cannot be tampered with.
# ---------------------------------------------------------------------------
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="revomail_session",
    max_age=60 * 60 * 24 * 7,  # 7 days
    https_only=False,           # set to True in production (HTTPS only)
    same_site="lax",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server and the built preview server
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,  # needed for session cookies
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api")
app.include_router(auth.router,   prefix="/api/auth",   tags=["auth"])
app.include_router(emails.router, prefix="/api/emails", tags=["emails"])
app.include_router(ai.router,     prefix="/api/ai",     tags=["ai"])

# Future routers:
# from app.routers import voice
# app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
