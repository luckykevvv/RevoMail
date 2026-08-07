import uvicorn

from backend.app.main import app
from backend.app.config import settings


if __name__ == "__main__":
    uvicorn.run(app, host=settings.host, port=settings.port, reload=False)
