import uvicorn

from backend.app.main import app
from backend.app.config import settings


if __name__ == "__main__":
    # OAuth callback query parameters contain a short-lived authorization code.
    # Keep Uvicorn's request-target access log disabled so the code is never
    # copied into terminal output or process-manager logs.
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=False,
        access_log=False,
    )
