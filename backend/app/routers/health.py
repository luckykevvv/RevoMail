from datetime import datetime, timezone

from fastapi import APIRouter, Request


router = APIRouter()


@router.get("/health")
async def health_check(request: Request):
    """Report process and database readiness without exposing configuration."""
    database_ready = request.app.state.database.is_ready()
    return {
        "status": "ok" if database_ready else "degraded",
        "service": "revomail-api",
        "checks": {"database": "ok" if database_ready else "failed"},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
