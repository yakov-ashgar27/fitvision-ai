"""Append-only audit log (US-20). Rows are only ever inserted, never updated."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy.orm import Session

from .models import AuditLog


def audit(db: Session, user_id: int | None, action: str, entity: str | None = None,
          entity_id: int | None = None, request: Request | None = None) -> None:
    ip = None
    if request is not None:
        fwd = request.headers.get("x-forwarded-for")
        ip = (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else None))
    db.add(AuditLog(user_id=user_id, action=action[:50], entity_name=entity[:50] if entity else None,
                    entity_id=entity_id, ip_address=ip[:45] if ip else None,
                    created_at=datetime.now(UTC).replace(tzinfo=None)))
