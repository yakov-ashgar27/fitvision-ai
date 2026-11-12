"""Email delivery (US-15, BR-08 reminders). Without SMTP settings, messages are logged instead of sent."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from pathlib import Path

from ..config import settings

log = logging.getLogger("fitvision.email")


def send(to: str, subject: str, body: str, attachment: str | None = None) -> bool:
    if not settings.smtp_host:
        log.info("email (SMTP not configured) to=%s subject=%s attachment=%s", to, subject, attachment)
        return True
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if attachment:
        p = Path(attachment)
        sub = "pdf" if p.suffix == ".pdf" else "vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        msg.add_attachment(p.read_bytes(), maintype="application", subtype=sub, filename=p.name)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
        s.starttls()
        if settings.smtp_user:
            s.login(settings.smtp_user, settings.smtp_password or "")
        s.send_message(msg)
    return True
