import base64
import hashlib
import json
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from uuid import uuid4

from backend.app.persistence import Database, TokenProtector, utc_now


def _cursor_encode(received_at: str, message_id: str) -> str:
    raw = json.dumps([received_at, message_id], separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _cursor_decode(value: str) -> tuple[str, str]:
    try:
        padded = value + "=" * (-len(value) % 4)
        received_at, message_id = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        return str(received_at), str(message_id)
    except Exception as exc:
        raise ValueError("Invalid mailbox cursor.") from exc


@dataclass(frozen=True)
class IdempotencyClaim:
    state: str
    response: dict | None = None


class MailboxRepository:
    def __init__(self, database: Database, protector: TokenProtector):
        self.database = database
        self.protector = protector

    def _protect_text(self, value: str | None) -> str | None:
        return self.protector.protect({"value": value}) if value else None

    def _unprotect_text(self, value: str | None) -> str:
        if not value:
            return ""
        try:
            return str(self.protector.unprotect(value).get("value") or "")
        except RuntimeError:
            return ""

    def upsert_messages(self, connection_id: str, messages: list[dict]) -> None:
        now = utc_now().isoformat()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                for message in messages:
                    local_id = f"{connection_id}:{message['id']}"
                    connection.execute(
                        'INSERT INTO "MailboxMessage" ("id", "connectionId", "providerMessageId", "threadId", "historyId", "sender", "recipients", "subject", "receivedAt", "preview", "unread", "starred", "category", "attachments", "bodyTextEncrypted", "bodyHtmlEncrypted", "createdAt", "updatedAt") '
                        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
                        'ON CONFLICT("connectionId", "providerMessageId") DO UPDATE SET "threadId"=excluded."threadId", "historyId"=excluded."historyId", '
                        '"sender"=excluded."sender", "recipients"=excluded."recipients", "subject"=excluded."subject", "receivedAt"=excluded."receivedAt", '
                        '"preview"=excluded."preview", "unread"=excluded."unread", "starred"=excluded."starred", "category"=excluded."category", '
                        '"attachments"=excluded."attachments", "bodyTextEncrypted"=excluded."bodyTextEncrypted", "bodyHtmlEncrypted"=excluded."bodyHtmlEncrypted", "updatedAt"=excluded."updatedAt"',
                        (
                            local_id, connection_id, message["id"], message.get("threadId"), message.get("historyId"),
                            message.get("sender", ""), json.dumps(message.get("recipients", []), separators=(",", ":")),
                            message.get("subject") or "(no subject)", message.get("receivedAt") or now, message.get("preview", ""),
                            int(bool(message.get("unread"))), int(bool(message.get("starred"))), message.get("category"),
                            json.dumps(message.get("attachments", []), separators=(",", ":")),
                            self._protect_text(message.get("bodyText")), self._protect_text(message.get("bodyHtmlSafe")), now, now,
                        ),
                    )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise

    def delete_messages(self, connection_id: str, provider_ids: list[str]) -> None:
        if not provider_ids:
            return
        placeholders = ",".join("?" for _ in provider_ids)
        with self.database.connect() as connection:
            connection.execute(
                f'DELETE FROM "MailboxMessage" WHERE "connectionId"=? AND "providerMessageId" IN ({placeholders})',
                (connection_id, *provider_ids),
            )

    def clear_messages(self, connection_id: str) -> None:
        with self.database.connect() as connection:
            connection.execute('DELETE FROM "MailboxMessage" WHERE "connectionId"=?', (connection_id,))

    def list_messages(
        self, connection_id: str, limit: int, cursor: str | None = None, query: str = "",
        category: str | None = None, unread: bool | None = None, starred: bool | None = None,
    ) -> dict:
        clauses = ['"connectionId"=?']
        values: list[Any] = [connection_id]
        if cursor:
            received_at, message_id = _cursor_decode(cursor)
            clauses.append('("receivedAt"<? OR ("receivedAt"=? AND "id"<?))')
            values.extend([received_at, received_at, message_id])
        if query.strip():
            clauses.append('(LOWER("sender") LIKE ? OR LOWER("subject") LIKE ? OR LOWER("preview") LIKE ?)')
            term = f"%{query.strip().lower()}%"
            values.extend([term, term, term])
        if category:
            clauses.append('"category"=?')
            values.append(category)
        if unread is not None:
            clauses.append('"unread"=?')
            values.append(int(unread))
        if starred is not None:
            clauses.append('"starred"=?')
            values.append(int(starred))
        values.append(limit + 1)
        with self.database.connect() as connection:
            rows = connection.execute(
                f'SELECT * FROM "MailboxMessage" WHERE {" AND ".join(clauses)} ORDER BY "receivedAt" DESC, "id" DESC LIMIT ?', values
            ).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._summary(row) for row in rows]
        next_cursor = _cursor_encode(rows[-1]["receivedAt"], rows[-1]["id"]) if has_more and rows else None
        return {"items": items, "page": {"nextCursor": next_cursor, "hasMore": has_more}}

    def get_message(self, connection_id: str, provider_message_id: str) -> dict | None:
        with self.database.connect() as connection:
            row = connection.execute(
                'SELECT * FROM "MailboxMessage" WHERE "connectionId"=? AND "providerMessageId"=?',
                (connection_id, provider_message_id),
            ).fetchone()
        if not row:
            return None
        message = self._summary(row)
        message.update({
            "attachments": json.loads(row["attachments"]),
            "bodyText": self._unprotect_text(row["bodyTextEncrypted"]),
            "bodyHtmlSafe": self._unprotect_text(row["bodyHtmlEncrypted"]),
        })
        return message

    def update_flags(self, connection_id: str, provider_message_id: str, unread: bool | None, starred: bool | None) -> None:
        fields: list[str] = []
        values: list[Any] = []
        if unread is not None:
            fields.append('"unread"=?')
            values.append(int(unread))
        if starred is not None:
            fields.append('"starred"=?')
            values.append(int(starred))
        if not fields:
            return
        fields.append('"updatedAt"=?')
        values.extend([utc_now().isoformat(), connection_id, provider_message_id])
        with self.database.connect() as connection:
            connection.execute(
                f'UPDATE "MailboxMessage" SET {", ".join(fields)} WHERE "connectionId"=? AND "providerMessageId"=?', values
            )

    def sync_state(self, connection_id: str) -> dict:
        with self.database.connect() as connection:
            row = connection.execute('SELECT * FROM "MailboxSyncState" WHERE "connectionId"=?', (connection_id,)).fetchone()
        if not row:
            return {"status": "idle", "phase": "full", "lastSyncedAt": None, "jobId": None, "historyId": None, "pageCursor": None}
        return {
            "status": row["status"].lower(), "phase": row["phase"].lower(), "lastSyncedAt": row["lastSyncedAt"],
            "jobId": row["activeJobId"], "historyId": row["historyId"], "pageCursor": row["pageCursor"],
            "errorCode": row["lastErrorCode"],
        }

    def set_sync_state(self, connection_id: str, **changes: Any) -> None:
        current = self.sync_state(connection_id)
        values = {
            "status": str(changes.get("status", current["status"])).upper(),
            "phase": str(changes.get("phase", current["phase"])).upper(),
            "pageCursor": changes.get("page_cursor", current.get("pageCursor")),
            "historyId": changes.get("history_id", current.get("historyId")),
            "activeJobId": changes.get("job_id", current.get("jobId")),
            "lastSyncedAt": changes.get("last_synced_at", current.get("lastSyncedAt")),
            "lastErrorCode": changes.get("error_code", current.get("errorCode")),
        }
        now = utc_now().isoformat()
        with self.database.connect() as connection:
            connection.execute(
                'INSERT INTO "MailboxSyncState" ("connectionId", "status", "phase", "pageCursor", "historyId", "activeJobId", "lastSyncedAt", "lastErrorCode", "updatedAt") '
                'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT("connectionId") DO UPDATE SET "status"=excluded."status", "phase"=excluded."phase", '
                '"pageCursor"=excluded."pageCursor", "historyId"=excluded."historyId", "activeJobId"=excluded."activeJobId", '
                '"lastSyncedAt"=excluded."lastSyncedAt", "lastErrorCode"=excluded."lastErrorCode", "updatedAt"=excluded."updatedAt"',
                (connection_id, values["status"], values["phase"], values["pageCursor"], values["historyId"], values["activeJobId"], values["lastSyncedAt"], values["lastErrorCode"], now),
            )

    def claim_idempotency(self, user_id: str, key: str, operation: str, request_payload: dict, limit_per_minute: int) -> IdempotencyClaim:
        request_hash = hashlib.sha256(json.dumps(request_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        now = utc_now()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    'SELECT "requestHash", "status", "response" FROM "IdempotencyKey" WHERE "key"=? AND "userId"=? AND "operation"=?',
                    (key, user_id, operation),
                ).fetchone()
                if row:
                    connection.execute("COMMIT")
                    if row["requestHash"] != request_hash:
                        return IdempotencyClaim("CONFLICT")
                    return IdempotencyClaim(row["status"], json.loads(row["response"]) if row["response"] else None)
                recent = connection.execute(
                    'SELECT COUNT(*) FROM "IdempotencyKey" WHERE "userId"=? AND "operation"=? AND "createdAt">=?',
                    (user_id, operation, (now - timedelta(minutes=1)).isoformat()),
                ).fetchone()[0]
                if recent >= limit_per_minute:
                    connection.execute("COMMIT")
                    return IdempotencyClaim("RATE_LIMITED")
                connection.execute(
                    'INSERT INTO "IdempotencyKey" ("key", "userId", "operation", "requestHash", "status", "expiresAt", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?)',
                    (key, user_id, operation, request_hash, "STARTED", (now + timedelta(days=7)).isoformat(), now.isoformat()),
                )
                connection.execute("COMMIT")
                return IdempotencyClaim("NEW")
            except Exception:
                connection.execute("ROLLBACK")
                raise

    def finish_idempotency(self, user_id: str, key: str, operation: str, status: str, response: dict) -> None:
        with self.database.connect() as connection:
            connection.execute(
                'UPDATE "IdempotencyKey" SET "status"=?, "response"=? WHERE "key"=? AND "userId"=? AND "operation"=?',
                (status, json.dumps(response, separators=(",", ":")), key, user_id, operation),
            )

    def audit(self, user_id: str, action: str, resource_id: str | None, outcome: str, correlation_id: str) -> None:
        with self.database.connect() as connection:
            connection.execute(
                'INSERT INTO "AuditRecord" ("id", "userId", "action", "resourceType", "resourceId", "outcome", "correlationId", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (str(uuid4()), user_id, action, "email", resource_id, outcome, correlation_id, utc_now().isoformat()),
            )

    @staticmethod
    def _summary(row) -> dict:
        return {
            "id": row["providerMessageId"], "threadId": row["threadId"], "sender": row["sender"],
            "recipients": json.loads(row["recipients"]), "subject": row["subject"], "receivedAt": row["receivedAt"],
            "preview": row["preview"], "unread": bool(row["unread"]), "starred": bool(row["starred"]), "category": row["category"],
            "attachments": json.loads(row["attachments"]),
        }
