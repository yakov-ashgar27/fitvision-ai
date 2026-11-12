"""Cache and counters on Redis (section 6.3.2), with an in-process fallback for tests and local runs."""
from __future__ import annotations

import json
import threading
import time
from typing import Any

from .config import settings

try:
    import redis  # type: ignore
except ImportError:  # pragma: no cover
    redis = None


class _Memory:
    def __init__(self) -> None:
        self._d: dict[str, tuple[float | None, str]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> str | None:
        with self._lock:
            item = self._d.get(key)
            if item is None:
                return None
            exp, val = item
            if exp is not None and exp < time.time():
                del self._d[key]
                return None
            return val

    def set(self, key: str, value: str, ex: int | None = None) -> None:
        with self._lock:
            self._d[key] = (time.time() + ex if ex else None, value)

    def delete(self, *keys: str) -> None:
        with self._lock:
            for k in keys:
                self._d.pop(k, None)

    def incr(self, key: str) -> int:
        with self._lock:
            exp, val = self._d.get(key, (None, "0"))
            n = int(val) + 1
            self._d[key] = (exp, str(n))
            return n

    def expire(self, key: str, seconds: int) -> None:
        with self._lock:
            if key in self._d:
                self._d[key] = (time.time() + seconds, self._d[key][1])

    def flushall(self) -> None:
        with self._lock:
            self._d.clear()


def _client():
    if settings.redis_url and redis is not None:
        return redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _Memory()


client = _client()


def get_json(key: str) -> Any | None:
    try:
        raw = client.get(key)
    except Exception:  # cache failures never break a request
        return None
    return json.loads(raw) if raw else None


def set_json(key: str, value: Any, ttl: int) -> None:
    try:
        client.set(key, json.dumps(value, default=str, ensure_ascii=False), ex=ttl)
    except Exception:
        pass


def invalidate(*keys: str) -> None:
    try:
        client.delete(*keys)
    except Exception:
        pass


def hit_counter(key: str, window_seconds: int) -> int:
    n = client.incr(key)
    if n == 1:
        client.expire(key, window_seconds)
    return n


# cache keys
def k_rules(exercise_id: int) -> str:
    return f"rules:{exercise_id}"


def k_dashboard(trainer_id: int) -> str:
    return f"dash:{trainer_id}"


def k_alerts(trainer_id: int) -> str:
    return f"alerts:{trainer_id}"
