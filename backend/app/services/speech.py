"""Replaceable cloud transcription boundary. Audio and text are never logged."""
import time
from collections import deque

import httpx

from backend.app.errors import AppError


class SpeechService:
    def __init__(self, settings):
        self.settings = settings
        self.attempts = {}

    def admit(self, user_id):
        now = time.monotonic()
        # Prune inactive users as well as old requests; this is a single-process MVP.
        self.attempts = {key: deque(t for t in entries if t > now - 60)
                         for key, entries in self.attempts.items() if entries and entries[-1] > now - 60}
        entries = self.attempts.setdefault(user_id, deque())
        if len(entries) >= self.settings.speech_limit_per_minute:
            raise AppError("VOICE_RATE_LIMITED", "Too many transcription requests. Try again shortly.", 429, True)
        entries.append(now)

    async def transcribe(self, audio, mime, language):
        extension = {"audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg"}[mime]
        try:
            async with httpx.AsyncClient(timeout=self.settings.speech_timeout_seconds) as client:
                response = await client.post(
                    self.settings.speech_api_url,
                    headers={"Authorization": f"Bearer {self.settings.openai_api_key}"},
                    files={"file": (f"command.{extension}", audio, mime)},
                    data={"model": self.settings.speech_model, "language": language.split("-")[0], "response_format": "json"},
                )
            if response.status_code == 429:
                raise AppError("VOICE_RATE_LIMITED", "The speech service is busy. Try again shortly.", 429, True)
            if response.status_code in (400, 415, 422):
                raise AppError("VOICE_INVALID_AUDIO", "The recording could not be decoded. Record again or type a command.", 422)
            if response.status_code >= 400:
                raise AppError("VOICE_PROVIDER_FAILED", "The speech service is unavailable. Type a command or try again.", 502, True)
            text = response.json().get("text", "")
            if not isinstance(text, str) or not text.strip():
                raise AppError("VOICE_NO_SPEECH", "No speech was recognised. Record again or type a command.", 422)
            if len(text) > 2000:
                raise AppError("VOICE_TRANSCRIPT_TOO_LONG", "Use one short command at a time.", 422)
            return text.strip()
        except httpx.TimeoutException:
            raise AppError("VOICE_TIMEOUT", "Transcription timed out. Record again or type a command.", 504, True) from None
        except (httpx.HTTPError, ValueError, AttributeError):
            raise AppError("VOICE_PROVIDER_FAILED", "The speech service is unavailable. Type a command or try again.", 502, True) from None
