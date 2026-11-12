"""Business rules BR-01 to BR-08 and BR-12 as pure functions (section 4.4).

No database access here, so every rule can be unit-tested in isolation. Thresholds are parameters,
not constants buried in the logic, as the specification requires.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

SEVERITY_PENALTY = {"Low": 5, "Med": 15, "High": 30}  # BR-02
FAILURE_POINT_RATIO = 0.15  # BR-05
REPEAT_ERROR_SESSIONS = 3  # BR-06
SCORE_DROP_PCT = 5.0  # BR-07
INACTIVITY_DAYS = 5  # BR-08
TREND_WINDOW = 3  # BR-04


# ---------- repetition and set level ----------

def rep_score(violated_severities: Iterable[str]) -> float:
    """BR-02: start at 100, subtract per violated rule by severity, floor at 0."""
    score = 100 - sum(SEVERITY_PENALTY[s] for s in violated_severities)
    return float(max(score, 0))


def rep_is_valid(reached_depth: bool, violated_severities: Iterable[str]) -> bool:
    """BR-01: reached the exercise depth threshold and no High-severity error."""
    return reached_depth and "High" not in set(violated_severities)


def set_score(rep_scores: Sequence[float]) -> float | None:
    """BR-03: a set's score is the mean of its repetition scores."""
    return round(sum(rep_scores) / len(rep_scores), 2) if rep_scores else None


def session_score(sets: Sequence[tuple[float | None, int]]) -> float | None:
    """BR-03: session score = set scores weighted by the number of repetitions in each set."""
    pairs = [(s, n) for s, n in sets if s is not None and n > 0]
    total = sum(n for _, n in pairs)
    return round(sum(s * n for s, n in pairs) / total, 2) if total else None


def failure_points(total_reps: int, violations_by_rule: dict[int, int],
                   ratio: float = FAILURE_POINT_RATIO) -> dict[int, float]:
    """BR-05: rules violated in at least `ratio` of the set's reps, with the share (0-100)."""
    if total_reps <= 0:
        return {}
    return {
        rule_id: round(100 * count / total_reps, 1)
        for rule_id, count in violations_by_rule.items()
        if count / total_reps >= ratio
    }


def improvement(current: float | None, previous: Sequence[float], window: int = TREND_WINDOW) -> float | None:
    """BR-04: % change versus the mean of the previous `window` sessions; None = not enough data."""
    if current is None or len(previous) < window:
        return None
    base = sum(previous[:window]) / window
    if base == 0:
        return None
    return round(100 * (current - base) / base, 2)


def should_generate_report(status: str, completed_sets: int) -> bool:
    """BR-12: an aborted session gets a (partial) report only if at least one set was completed."""
    return completed_sets >= 1 if status == "Aborted" else status == "Done"


# ---------- alerts (BR-06 to BR-08) ----------

@dataclass
class Alert:
    kind: str  # repeat_error | score_drop | inactivity
    trainee_id: int
    severity: str
    message: str
    data: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"kind": self.kind, "trainee_id": self.trainee_id, "severity": self.severity,
                "message": self.message, **self.data}


def repeat_error_rules(session_failure_rules: Sequence[set[int]], n: int = REPEAT_ERROR_SESSIONS) -> set[int]:
    """BR-06: rules that were a failure point in each of the last `n` sessions (newest first)."""
    if len(session_failure_rules) < n:
        return set()
    common = set(session_failure_rules[0])
    for s in session_failure_rules[1:n]:
        common &= s
    return common


def weekly_drop(scores: Sequence[tuple[datetime, float]], today: date,
                threshold_pct: float = SCORE_DROP_PCT) -> float | None:
    """BR-07: % drop of this week's mean score versus last week's; returned only if above threshold."""
    week_start = today - timedelta(days=6)
    prev_start = week_start - timedelta(days=7)
    this_week = [s for t, s in scores if week_start <= t.date() <= today]
    last_week = [s for t, s in scores if prev_start <= t.date() < week_start]
    if not this_week or not last_week:
        return None
    a, b = sum(this_week) / len(this_week), sum(last_week) / len(last_week)
    if b == 0:
        return None
    drop = 100 * (b - a) / b
    return round(drop, 1) if drop > threshold_pct else None


def inactive_days(last_session: datetime | None, has_active_plan: bool, today: date,
                  limit: int = INACTIVITY_DAYS) -> int | None:
    """BR-08: days without training, returned only for trainees with an active plan above the limit."""
    if not has_active_plan:
        return None
    if last_session is None:
        return limit + 1
    days = (today - last_session.date()).days
    return days if days > limit else None
