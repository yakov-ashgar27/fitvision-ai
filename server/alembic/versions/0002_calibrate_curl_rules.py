"""Calibrate the biceps-curl rules after the first real-phone trial (12.11.2026, chapter 10).

In a side view the 2D elbow angle at the top of a full curl was 62°–72° (never below the opening value of 50°),
and the upper arm moved 21°–33° from the torso during normal reps (opening value 20°). The new values are
75° and 35°. Only rules still holding the opening values are changed, so an admin's own edits are kept.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-12
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

CHANGES = [  # rule name, old max angle, new max angle
    ("טווח כפיפה מלא", 50, 75),
    ("מרפק צמוד לגוף", 20, 35),
]


def _apply(pairs) -> None:
    bind = op.get_bind()
    for name, old, new in pairs:
        bind.execute(
            sa.text("UPDATE TechniqueRules SET max_angle = :new WHERE rule_name = :name AND max_angle = :old"),
            {"new": new, "old": old, "name": name},
        )


def upgrade() -> None:
    _apply(CHANGES)


def downgrade() -> None:
    _apply([(name, new, old) for name, old, new in CHANGES])
