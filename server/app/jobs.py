"""Background work on an RQ queue (section 6.3.2). Without REDIS_URL, jobs run inline."""
from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from .config import settings

_inline_results: dict[str, dict[str, Any]] = {}


def _queue():
    if not settings.redis_url:
        return None
    from redis import Redis
    from rq import Queue

    return Queue("fitvision", connection=Redis.from_url(settings.redis_url))


def enqueue(func: Callable[..., Any], *args: Any) -> tuple[str, bool]:
    """Returns (job_id, queued). queued=False means the job already ran inline."""
    q = _queue()
    if q is None:
        job_id = uuid.uuid4().hex
        try:
            _inline_results[job_id] = {"status": "finished", "result": func(*args)}
        except Exception as exc:  # surface the failure through the job status
            _inline_results[job_id] = {"status": "failed", "error": str(exc)}
        return job_id, False
    job = q.enqueue(func, *args, job_timeout=120, result_ttl=3600)
    return job.id, True


def status(job_id: str) -> dict[str, Any]:
    if job_id in _inline_results:
        return _inline_results[job_id]
    q = _queue()
    if q is None:
        return {"status": "unknown"}
    from rq.exceptions import NoSuchJobError
    from rq.job import Job

    try:
        job = Job.fetch(job_id, connection=q.connection)
    except NoSuchJobError:
        return {"status": "unknown"}
    st = job.get_status(refresh=True)
    out: dict[str, Any] = {"status": str(st.value if hasattr(st, "value") else st)}
    if out["status"] == "finished":
        out["result"] = job.return_value()
    if out["status"] == "failed":
        out["error"] = "job failed"
    return out
