"""In-memory sliding-window rate limiter (single-process deployments).

Used to slow down credential brute-forcing on the login endpoint. Like
the voice session registry, the state lives in the process: with multiple
workers each one enforces its own window, which is acceptable here.
"""

import threading
import time
from collections import deque


class SlidingWindowLimiter:
    """Counts failures per key over a rolling time window."""

    def __init__(self, max_failures: int, window_seconds: int):
        self.max_failures = max_failures
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _pruned(self, key: str, now: float) -> deque | None:
        """Drop timestamps outside the window; forget the key when empty."""
        q = self._failures.get(key)
        if q is None:
            return None
        cutoff = now - self.window_seconds
        while q and q[0] <= cutoff:
            q.popleft()
        if not q:
            del self._failures[key]
            return None
        return q

    def retry_after(self, key: str) -> int:
        """Seconds to wait before a new attempt is allowed (0 = allowed now)."""
        with self._lock:
            now = time.time()
            q = self._pruned(key, now)
            if q is None or len(q) < self.max_failures:
                return 0
            # A slot frees up when the oldest failure leaves the window
            return max(1, int(q[0] + self.window_seconds - now) + 1)

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = time.time()
            # Opportunistic sweep to keep memory bounded under churn
            if len(self._failures) > 1024:
                for k in list(self._failures):
                    self._pruned(k, now)
            q = self._pruned(key, now)
            if q is None:
                q = deque()
                self._failures[key] = q
            q.append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
