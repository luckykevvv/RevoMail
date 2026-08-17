import json
from dataclasses import dataclass
from datetime import timedelta
from uuid import uuid4

from backend.app.config import Settings
from backend.app.persistence import Database, utc_now


@dataclass(frozen=True)
class Job:
    id: str
    kind: str
    payload: dict
    attempts: int


class JobRepository:
    def __init__(self, database: Database, settings: Settings):
        self.database = database
        self.settings = settings

    def enqueue(self, kind: str, payload: dict) -> str:
        job_id = str(uuid4())
        now = utc_now().isoformat()
        with self.database.connect() as connection:
            connection.execute(
                'INSERT INTO "Job" ("id", "kind", "payload", "status", "attempts", "maxAttempts", "availableAt", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)',
                (job_id, kind, json.dumps(payload, separators=(",", ":")), "PENDING", self.settings.job_max_attempts, now, now, now),
            )
        return job_id

    def claim_next(self) -> Job | None:
        now = utc_now()
        lease_until = (now + timedelta(seconds=self.settings.job_lease_seconds)).isoformat()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    'SELECT "id", "kind", "payload", "attempts" FROM "Job" WHERE "status"=? AND "availableAt"<=? AND "attempts"<"maxAttempts" ORDER BY "createdAt" LIMIT 1',
                    ("PENDING", now.isoformat()),
                ).fetchone()
                if not row:
                    connection.execute("COMMIT")
                    return None
                connection.execute(
                    'UPDATE "Job" SET "status"=?, "attempts"="attempts"+1, "leaseUntil"=?, "updatedAt"=? WHERE "id"=?',
                    ("RUNNING", lease_until, now.isoformat(), row["id"]),
                )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        return Job(id=row["id"], kind=row["kind"], payload=json.loads(row["payload"]), attempts=row["attempts"] + 1)

    def recover_interrupted(self) -> int:
        now = utc_now().isoformat()
        with self.database.connect() as connection:
            cursor = connection.execute(
                'UPDATE "Job" SET "status"=CASE WHEN "attempts">="maxAttempts" THEN ? ELSE ? END, "lastErrorCode"=?, "leaseUntil"=NULL, "updatedAt"=? WHERE "status"=? AND "leaseUntil"<=?',
                ("FAILED", "PENDING", "WORKER_INTERRUPTED", now, "RUNNING", now),
            )
            return cursor.rowcount

    def complete(self, job_id: str) -> None:
        with self.database.connect() as connection:
            connection.execute('UPDATE "Job" SET "status"=?, "leaseUntil"=NULL, "updatedAt"=? WHERE "id"=?', ("SUCCEEDED", utc_now().isoformat(), job_id))
