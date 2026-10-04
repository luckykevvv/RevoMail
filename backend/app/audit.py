"""Audit trail for sensitive actions. Records who did what and the outcome — never message content."""

from uuid import uuid4

from backend.app.persistence import Database, utc_now


class AuditRepository:
    def __init__(self, database: Database):
        self.database = database

    def record(
        self,
        user_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None,
        outcome: str,
        correlation_id: str,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute(
                'INSERT INTO "AuditRecord" ("id", "userId", "action", "resourceType", "resourceId", "outcome", "correlationId", "createdAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                (str(uuid4()), user_id, action, resource_type, resource_id, outcome, correlation_id, utc_now().isoformat()),
            )
