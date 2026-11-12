"""Initial schema: the 17 tables of section 4.3 with the indexes of table 6.5.

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""
from alembic import op

from app import models  # noqa: F401
from app.db import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
