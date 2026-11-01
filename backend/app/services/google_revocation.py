"""Google OAuth grant revocation without exposing stored provider tokens."""

import httpx

from backend.app.errors import AppError


GOOGLE_REVOCATION_URL = "https://oauth2.googleapis.com/revoke"


async def revoke_google_token(token: str) -> None:
    timeout = httpx.Timeout(10.0, connect=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                GOOGLE_REVOCATION_URL,
                data={"token": token},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.TimeoutException as exc:
        raise AppError(
            "GOOGLE_REVOCATION_UNCERTAIN",
            "Google did not confirm revocation. Your local connection was kept; retry or use Disconnect Gmail.",
            504,
            True,
        ) from exc
    except httpx.HTTPError as exc:
        raise AppError(
            "GOOGLE_REVOCATION_UNCERTAIN",
            "Google could not confirm revocation. Your local connection was kept; retry or use Disconnect Gmail.",
            502,
            True,
        ) from exc

    if response.status_code != 200:
        raise AppError(
            "GOOGLE_REVOCATION_FAILED",
            "Google did not accept the revocation. Your local connection was kept; retry or use Disconnect Gmail.",
            502,
            True,
        )
