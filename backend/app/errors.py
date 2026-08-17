from dataclasses import dataclass
from uuid import uuid4

from fastapi import Request


@dataclass
class AppError(Exception):
    code: str
    message: str
    status_code: int = 400
    retryable: bool = False


class ProviderError(AppError):
    pass


def correlation_id(request: Request) -> str:
    value = getattr(request.state, "correlation_id", None)
    if value:
        return value
    value = str(uuid4())
    request.state.correlation_id = value
    return value


def error_payload(request: Request, error: AppError) -> dict:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "retryable": error.retryable,
            "correlationId": correlation_id(request),
        }
    }
