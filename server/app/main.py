"""FitVision AI API – application factory."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .routers import admin, assignments, auth, exercises, me, metrics, plans, reports, sessions, trainer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("fitvision")


def _start_scheduler() -> None:
    """APScheduler only puts the daily alert job on the queue (6.3.2)."""
    from apscheduler.schedulers.background import BackgroundScheduler

    from . import jobs
    from .tasks import job_refresh_alerts

    sched = BackgroundScheduler(timezone="Asia/Jerusalem")
    sched.add_job(lambda: jobs.enqueue(job_refresh_alerts), "cron", hour=6, minute=7, id="alerts")
    sched.start()
    log.info("scheduler started")


def create_app() -> FastAPI:
    app = FastAPI(title="FitVision AI API", version="1.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=1024)  # compress JSON above 1KB (6.3.2)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"])
    for r in (auth, me, assignments, exercises, plans, sessions, reports, trainer, admin, metrics):
        app.include_router(r.router, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    # Optional: serve the built client from the same process (single-command demo, no nginx needed)
    static_dir = os.getenv("STATIC_DIR")
    if static_dir and Path(static_dir).is_dir():
        root = Path(static_dir).resolve()
        app.mount("/assets", StaticFiles(directory=root / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            f = (root / path).resolve()
            if path and f.is_file() and root in f.parents:
                return FileResponse(f)
            return FileResponse(root / "index.html")

    if settings.enable_scheduler:
        _start_scheduler()
    return app


app = create_app()
