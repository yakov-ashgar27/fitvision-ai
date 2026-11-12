"""Runtime configuration, read once from environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL") or "sqlite:///./fitvision.db")
    redis_url: str | None = field(default_factory=lambda: os.getenv("REDIS_URL") or None)
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", "dev-only-change-me-please-32-bytes!!"))
    jwt_minutes: int = field(default_factory=lambda: int(os.getenv("JWT_MINUTES", "60")))  # NFR-06
    cors_origins: list[str] = field(
        default_factory=lambda: [o for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o]
    )
    reports_dir: str = field(default_factory=lambda: os.getenv("REPORTS_DIR", "./var/reports"))
    smtp_host: str | None = field(default_factory=lambda: os.getenv("SMTP_HOST") or None)
    smtp_port: int = field(default_factory=lambda: int(os.getenv("SMTP_PORT", "587")))
    smtp_user: str | None = field(default_factory=lambda: os.getenv("SMTP_USER") or None)
    smtp_password: str | None = field(default_factory=lambda: os.getenv("SMTP_PASSWORD") or None)
    smtp_from: str = field(default_factory=lambda: os.getenv("SMTP_FROM", "FitVision AI <no-reply@fitvision.app>"))
    enable_scheduler: bool = field(default_factory=lambda: _bool("ENABLE_SCHEDULER", False))
    pdf_engine: str = field(default_factory=lambda: os.getenv("PDF_ENGINE", "chromium"))  # chromium | none
    seed_demo: bool = field(default_factory=lambda: _bool("SEED_DEMO", False))


settings = Settings()
