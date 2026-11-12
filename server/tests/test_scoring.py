"""BR-01 to BR-08 and BR-12 as pure functions (table 4.4)."""
from datetime import date, datetime

from app.services import scoring as s


def test_rep_score_br02():
    assert s.rep_score([]) == 100
    assert s.rep_score(["Low", "High"]) == 65  # 100 - 5 - 30
    assert s.rep_score(["High", "High", "High", "High"]) == 0  # floor at 0


def test_rep_validity_br01():
    assert s.rep_is_valid(True, ["Low", "Med"])
    assert not s.rep_is_valid(True, ["High"])
    assert not s.rep_is_valid(False, [])  # partial rep


def test_set_and_session_score_br03():
    assert s.set_score([100, 70, 85]) == 85
    assert s.set_score([]) is None
    # weighted by reps: (90*10 + 60*5) / 15 = 80
    assert s.session_score([(90, 10), (60, 5)]) == 80
    assert s.session_score([(None, 0)]) is None


def test_failure_points_br05_threshold_is_inclusive():
    fp = s.failure_points(20, {1: 3, 2: 2})  # 15% and 10%
    assert fp == {1: 15.0}


def test_improvement_br04():
    assert s.improvement(88, [80, 80]) is None  # fewer than 3 previous sessions
    assert s.improvement(88, [80, 80, 80, 10]) == 10.0  # only the 3 most recent count


def test_report_rule_br12():
    assert s.should_generate_report("Done", 0)
    assert not s.should_generate_report("Aborted", 0)
    assert s.should_generate_report("Aborted", 1)


def test_repeat_error_br06():
    assert s.repeat_error_rules([{1, 2}, {1}, {1, 3}]) == {1}
    assert s.repeat_error_rules([{1}, {1}]) == set()


def test_weekly_drop_br07():
    today = date(2028, 5, 20)
    scores = [(datetime(2028, 5, 18), 80.0), (datetime(2028, 5, 10), 90.0)]
    assert s.weekly_drop(scores, today) == 11.1
    assert s.weekly_drop([(datetime(2028, 5, 18), 88.0), (datetime(2028, 5, 10), 90.0)], today) is None  # 2.2%


def test_inactivity_br08():
    today = date(2028, 5, 20)
    assert s.inactive_days(datetime(2028, 5, 14), True, today) == 6
    assert s.inactive_days(datetime(2028, 5, 16), True, today) is None
    assert s.inactive_days(datetime(2028, 5, 1), False, today) is None
