from fastapi import APIRouter, Depends, Request

from backend.app.dependencies import require_csrf, require_session
from backend.app.errors import AppError

router = APIRouter()
LANGUAGES = ["en-AU", "en-US"]
MIME_TYPES = ["audio/webm", "audio/mp4", "audio/ogg"]


@router.get("/capabilities")
async def capabilities(request: Request, session=Depends(require_session)):
    settings = request.app.state.settings
    return {"available": bool(settings.openai_api_key), "languages": LANGUAGES, "mimeTypes": MIME_TYPES,
            "maxSeconds": settings.speech_max_seconds, "maxBytes": settings.speech_max_bytes,
            "timeoutSeconds": settings.speech_timeout_seconds}


@router.post("/transcriptions")
async def transcribe(request: Request, language: str = "en-AU", session=Depends(require_csrf)):
    settings = request.app.state.settings
    if not request.app.state.preferences.get(session.user["id"])["voiceEnabled"]:
        raise AppError("VOICE_DISABLED", "Enable voice input in Settings before recording.", 403)
    if not settings.openai_api_key:
        raise AppError("VOICE_UNAVAILABLE", "Cloud transcription is not configured. Type a command instead.", 503)
    mime = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if language not in LANGUAGES or mime not in MIME_TYPES:
        raise AppError("VOICE_INVALID_AUDIO", "The recording format or language is not supported.", 415)
    request.app.state.speech.admit(session.user["id"])
    audio = bytearray()
    try:
        async for chunk in request.stream():
            if len(audio) + len(chunk) > settings.speech_max_bytes:
                raise AppError("VOICE_AUDIO_TOO_LARGE", "The recording is too large. Use a shorter command.", 413)
            audio.extend(chunk)
        # Reject obvious non-audio before contacting the provider. The provider decodes the container.
        valid = ((mime == "audio/webm" and audio[:4] == b"\x1a\x45\xdf\xa3")
                 or (mime == "audio/ogg" and audio[:4] == b"OggS")
                 or (mime == "audio/mp4" and audio[4:8] == b"ftyp"))
        if not valid:
            raise AppError("VOICE_INVALID_AUDIO", "The recording is empty or invalid. Record again or type a command.", 422)
        text = await request.app.state.speech.transcribe(bytes(audio), mime, language)
        return {"text": text}
    finally:
        audio.clear()
