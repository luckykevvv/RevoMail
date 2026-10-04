"""
Idempotency protection for operations that must happen at most once (such as sending an email).

Rows live in the existing "IdempotencyKey" table. Only a request hash and a minimal response (the
provider message id) are stored — never recipients, subjects or bodies.
"""

import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta

from backend.app.persistence import Database, utc_now

STARTED = "STARTED"
COMPLETED = "COMPLETED"
UNKNOWN = "UNKNOWN"

# A STARTED row older than this is assumed to belong to an interrupted request whose outcome is unknown.
STALE_AFTER = timedelta(minutes=2)
RETENTION = timedelta(hours=24)


@dataclass(frozen=True)
class Decision:
    # "new"         -> caller owns the key and may perform the operation
    # "replay"      -> operation already completed; `response` holds the stored result
    # "in_progress" -> another request with this key is still running
    # "unknown"     -> an earlier attempt may or may not have reached the provider; do not repeat it
    # "mismatch"    -> the key was already used for a different request
    state: str
    response: dict | None = None


def request_hash(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class IdempotencyRepository:
    def __init__(self, database: Database):
        self.database = database

    def begin(self, key: str, user_id: str, operation: str, payload_hash: str) -> Decision:
        now = utc_now()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                connection.execute('DELETE FROM "IdempotencyKey" WHERE "expiresAt"<=?', (now.isoformat(),))
                row = connection.execute(
                    'SELECT "requestHash", "response", "status", "createdAt" FROM "IdempotencyKey" WHERE "key"=? AND "userId"=? AND "operation"=?',
                    (key, user_id, operation),
                ).fetchone()
                if row is None:
                    connection.execute(
                        'INSERT INTO "IdempotencyKey" ("key", "userId", "operation", "requestHash", "status", "expiresAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
                        (key, user_id, operation, payload_hash, STARTED, (now + RETENTION).isoformat(), now.isoformat()),
                    )
                    decision = Decision("new")
                elif row["requestHash"] != payload_hash:
                    decision = Decision("mismatch")
                elif row["status"] == COMPLETED:
                    decision = Decision("replay", json.loads(row["response"] or "{}"))
                elif row["status"] == UNKNOWN or row["createdAt"] <= (now - STALE_AFTER).isoformat():
                    decision = Decision("unknown")
                else:
                    decision = Decision("in_progress")
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        return decision

    def complete(self, key: str, user_id: str, operation: str, response: dict) -> None:
        with self.database.connect() as connection:
            connection.execute(
                'UPDATE "IdempotencyKey" SET "status"=?, "response"=? WHERE "key"=? AND "userId"=? AND "operation"=?',
                (COMPLETED, json.dumps(response, separators=(",", ":")), key, user_id, operation),
            )

    def mark_unknown(self, key: str, user_id: str, operation: str) -> None:
        with self.database.connect() as connection:
            connection.execute(
                'UPDATE "IdempotencyKey" SET "status"=? WHERE "key"=? AND "userId"=? AND "operation"=?',
                (UNKNOWN, key, user_id, operation),
            )

    def release(self, key: str, user_id: str, operation: str) -> None:
        """Forget a key whose operation definitely did not happen, so the same key may be retried."""
        with self.database.connect() as connection:
            connection.execute(
                'DELETE FROM "IdempotencyKey" WHERE "key"=? AND "userId"=? AND "operation"=? AND "status"=?',
                (key, user_id, operation, STARTED),
            )
