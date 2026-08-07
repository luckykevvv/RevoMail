from dataclasses import dataclass
from threading import Lock
from time import monotonic
from typing import Callable


@dataclass(frozen=True)
class OAuthTransaction:
    return_to: str
    expires_at: float


class OAuthTransactionStore:
    def __init__(self, ttl_seconds: int = 600, clock: Callable[[], float] = monotonic):
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._transactions: dict[str, OAuthTransaction] = {}
        self._lock = Lock()

    def put(self, state: str, return_to: str) -> None:
        now = self.clock()
        with self._lock:
            self._remove_expired(now)
            self._transactions[state] = OAuthTransaction(return_to=return_to, expires_at=now + self.ttl_seconds)

    def consume(self, state: str) -> OAuthTransaction | None:
        if not state:
            return None
        now = self.clock()
        with self._lock:
            transaction = self._transactions.pop(state, None)
            self._remove_expired(now)
        if transaction is None or transaction.expires_at <= now:
            return None
        return transaction

    def clear(self) -> None:
        with self._lock:
            self._transactions.clear()

    def _remove_expired(self, now: float) -> None:
        expired = [state for state, transaction in self._transactions.items() if transaction.expires_at <= now]
        for state in expired:
            self._transactions.pop(state, None)


oauth_transactions = OAuthTransactionStore()
