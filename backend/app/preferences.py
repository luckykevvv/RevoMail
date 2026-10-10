"""Validated, user-scoped preferences; no credentials belong in this store."""
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, ValidationError


class Preferences(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    language: Literal["en"] = "en"
    theme: Literal["system", "light", "dark"] = "system"
    reducedMotion: bool = False
    defaultAiModel: str | None = None
    replyLength: Literal["concise", "medium", "detailed"] = "medium"
    speechLanguage: Literal["auto", "en-AU", "en-US"] = "auto"
    voiceEnabled: bool = False
    voiceAutoPlay: bool = True


class PreferencesPatch(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    language: Literal["en"] | None = None
    theme: Literal["system", "light", "dark"] | None = None
    reducedMotion: bool | None = None
    defaultAiModel: str | None = None
    replyLength: Literal["concise", "medium", "detailed"] | None = None
    speechLanguage: Literal["auto", "en-AU", "en-US"] | None = None
    voiceEnabled: bool | None = None
    voiceAutoPlay: bool | None = None


class PreferencesRepository:
    def __init__(self, database, settings):
        self.database = database
        self.models = list(dict.fromkeys([settings.openai_model, *settings.ai_allowed_models]))

    def normalise(self, saved):
        result = Preferences().model_dump()
        for key in result:
            if key not in saved:
                continue
            value = saved[key]
            if key in {"voiceEnabled", "voiceAutoPlay", "reducedMotion"} and type(value) is int and value in (0, 1):
                value = bool(value)
            try:
                result[key] = getattr(Preferences(**{key: value}), key)
            except ValidationError:
                pass
        if result["defaultAiModel"] not in self.models:
            result["defaultAiModel"] = self.models[0]
        return result

    def get(self, user_id):
        with self.database.connect() as connection:
            row = connection.execute('SELECT * FROM "UserSettings" WHERE "userId"=?', (user_id,)).fetchone()
        return self.normalise(dict(row) if row else {})

    def update(self, user_id, patch):
        # Update only supplied fields inside a write transaction to avoid lost updates.
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute('SELECT * FROM "UserSettings" WHERE "userId"=?', (user_id,)).fetchone()
                values = self.normalise(dict(row) if row else {}) | patch
                values = Preferences(**values).model_dump()
                if values["defaultAiModel"] not in self.models:
                    raise ValueError("Unsupported AI model")
                keys = list(values)
                columns = ', '.join(f'"{key}"' for key in keys)
                assignments = ', '.join(f'"{key}"=excluded."{key}"' for key in keys)
                placeholders = ', '.join('?' for _ in keys)
                connection.execute(
                    f'INSERT INTO "UserSettings" ("userId", {columns}, "updatedAt") VALUES (?, {placeholders}, ?) '
                    f'ON CONFLICT("userId") DO UPDATE SET {assignments}, "updatedAt"=excluded."updatedAt"',
                    (user_id, *values.values(), datetime.now(timezone.utc).isoformat()),
                )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        return values
