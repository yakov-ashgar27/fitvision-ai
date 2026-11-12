from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, Request

from .. import models as m
from ..cache import hit_counter
from ..schemas import RumIn
from ..security import optional_user

router = APIRouter(tags=["metrics"])
log = logging.getLogger("fitvision.rum")


@router.post("/metrics/rum", status_code=204)
def rum(items: list[RumIn], request: Request, user: m.User | None = Depends(optional_user)):
    """Real-user metrics (6.3.4) are logged as structured lines, outside the business database."""
    ip = request.client.host if request.client else "?"
    if hit_counter(f"rum:{ip}", 60) > 120:
        return
    for it in items[:50]:
        log.info(json.dumps({"rum": it.name, "value": it.value, "page": it.page, "device": it.device,
                             "role": user.role if user else None}, ensure_ascii=False))
