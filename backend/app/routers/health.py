from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check — confirms the API is running."""
    return {
        "status": "ok",
        "service": "revomail-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
