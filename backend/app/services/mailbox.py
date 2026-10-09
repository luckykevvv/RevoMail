import asyncio
from contextlib import suppress

from backend.app.jobs import JobRepository
from backend.app.mailbox import MailboxRepository
from backend.app.persistence import AuthRepository, utc_now
from backend.app.services.gmail import GmailAdapter, HistoryExpired, MailProviderError


class MailboxSyncService:
    def __init__(self, repository: MailboxRepository, auth: AuthRepository, jobs: JobRepository):
        self.repository = repository
        self.auth = auth
        self.jobs = jobs
        self._wake = asyncio.Event()
        self._stopping = False

    def enqueue(self, user_id: str, connection_id: str) -> str:
        state = self.repository.sync_state(connection_id)
        if state["status"] == "syncing" and state.get("jobId"):
            return state["jobId"]
        phase = "history" if state.get("historyId") else "full"
        job_id = self.jobs.enqueue("mailbox-sync", {"userId": user_id, "connectionId": connection_id})
        self.repository.set_sync_state(connection_id, status="syncing", phase=phase, page_cursor=None, job_id=job_id, error_code=None)
        self._wake.set()
        return job_id

    def _continue(self, user_id: str, connection_id: str, phase: str, cursor: str | None, history_id: str | None) -> str:
        job_id = self.jobs.enqueue("mailbox-sync", {"userId": user_id, "connectionId": connection_id})
        self.repository.set_sync_state(
            connection_id, status="syncing", phase=phase, page_cursor=cursor, history_id=history_id,
            job_id=job_id, error_code=None,
        )
        self._wake.set()
        return job_id

    def process_next(self) -> bool:
        job = self.jobs.claim_next()
        if not job:
            return False
        if job.kind != "mailbox-sync":
            self.jobs.fail(job.id, "UNSUPPORTED_JOB_KIND")
            return True
        user_id = str(job.payload.get("userId") or "")
        connection_id = str(job.payload.get("connectionId") or "")
        account_tokens = self.auth.get_account_tokens(user_id, connection_id)
        if not account_tokens:
            self.jobs.fail(job.id, "MAILBOX_NOT_CONNECTED")
            self.repository.set_sync_state(connection_id, status="failed", job_id=None, error_code="MAILBOX_NOT_CONNECTED")
            return True
        account, tokens = account_tokens
        state = self.repository.sync_state(connection_id)
        adapter = GmailAdapter(tokens)
        try:
            if state["phase"] == "full":
                page = adapter.list_messages(20, state.get("pageCursor"))
                self.repository.upsert_messages(connection_id, page["items"])
                history_id = state.get("historyId") or next((item.get("historyId") for item in page["items"] if item.get("historyId")), None)
                self.jobs.complete(job.id)
                if page.get("nextCursor"):
                    self._continue(user_id, connection_id, "full", page["nextCursor"], history_id)
                elif history_id:
                    self._continue(user_id, connection_id, "history", None, history_id)
                else:
                    self.repository.set_sync_state(connection_id, status="idle", phase="history", page_cursor=None, job_id=None, last_synced_at=utc_now().isoformat())
            else:
                try:
                    page = adapter.list_history(str(state["historyId"]), state.get("pageCursor"))
                except HistoryExpired:
                    self.jobs.complete(job.id)
                    self.repository.clear_messages(connection_id)
                    self._continue(user_id, connection_id, "full", None, None)
                    return True
                self.repository.upsert_messages(connection_id, page["items"])
                self.repository.delete_messages(connection_id, page["deletedIds"])
                self.jobs.complete(job.id)
                if page.get("nextCursor"):
                    self._continue(user_id, connection_id, "history", page["nextCursor"], page["historyId"])
                else:
                    self.repository.set_sync_state(
                        connection_id, status="idle", phase="history", page_cursor=None, history_id=page["historyId"],
                        job_id=None, last_synced_at=utc_now().isoformat(), error_code=None,
                    )
        except MailProviderError as exc:
            if exc.retryable and job.attempts < self.jobs.settings.job_max_attempts:
                self.jobs.retry(job.id, exc.code, min(30, 2 ** job.attempts))
                self.repository.set_sync_state(connection_id, status="syncing", job_id=job.id, error_code=exc.code)
            else:
                self.jobs.fail(job.id, exc.code)
                self.repository.set_sync_state(connection_id, status="failed", job_id=None, error_code=exc.code)
        except Exception:
            self.jobs.fail(job.id, "SYNC_FAILED")
            self.repository.set_sync_state(connection_id, status="failed", job_id=None, error_code="SYNC_FAILED")
        return True

    async def run(self) -> None:
        while not self._stopping:
            processed = await asyncio.to_thread(self.process_next)
            if processed:
                continue
            self._wake.clear()
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=1.0)

    def stop(self) -> None:
        self._stopping = True
        self._wake.set()
