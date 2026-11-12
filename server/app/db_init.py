"""Create the SQL Server database if it does not exist yet, then run migrations and seed data."""
from __future__ import annotations

import subprocess
import sys
import time

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from .config import settings


def ensure_database() -> None:
    url = make_url(settings.database_url)
    if not url.drivername.startswith("mssql"):
        return
    name = url.database
    master = url.set(database="master")
    for attempt in range(60):  # SQL Server needs a while to accept connections on first start
        try:
            eng = create_engine(master, isolation_level="AUTOCOMMIT")
            with eng.connect() as c:
                c.execute(text(f"IF DB_ID(N'{name}') IS NULL CREATE DATABASE [{name}]"))
            return
        except Exception as exc:  # noqa: BLE001
            print(f"waiting for SQL Server ({attempt}): {exc.__class__.__name__}", flush=True)
            time.sleep(3)
    sys.exit("SQL Server is not reachable")


if __name__ == "__main__":
    ensure_database()
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)
    subprocess.run([sys.executable, "-m", "app.seed"], check=True)
