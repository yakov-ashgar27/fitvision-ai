"""Request and response models. Every request is validated here before it reaches the database."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Role = Literal["Trainee", "Trainer", "Admin"]
Phase = Literal["Down", "Bottom", "Up"]
Severity = Literal["Low", "Med", "High"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth / users ----------

class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)  # US-01
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    phone: str | None = Field(default=None, max_length=20)
    role: Literal["Trainee", "Trainer"] = "Trainee"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(ORM):
    user_id: int
    email: str
    first_name: str
    last_name: str
    phone: str | None
    role: Role
    is_active: bool
    consent_at: datetime | None
    created_at: datetime | None = None
    last_login: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TraineeProfileIn(BaseModel):
    birth_date: date | None = None
    gender: Literal["M", "F", "O"] | None = None
    height_cm: float | None = Field(default=None, ge=100, le=250)  # US-02: plausible ranges
    weight_kg: float | None = Field(default=None, ge=30, le=300)
    fitness_level: Literal["Beginner", "Intermediate", "Advanced"] | None = None
    injuries_notes: str | None = Field(default=None, max_length=2000)


class TrainerProfileIn(BaseModel):
    certification: str | None = Field(default=None, max_length=100)
    specialization: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=2000)


class ProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=50)
    last_name: str | None = Field(default=None, min_length=1, max_length=50)
    phone: str | None = Field(default=None, max_length=20)
    trainee: TraineeProfileIn | None = None
    trainer: TrainerProfileIn | None = None


# ---------- assignments ----------

class AssignmentRequest(BaseModel):
    invite_code: str = Field(min_length=8, max_length=8)


class AssignmentAction(BaseModel):
    action: Literal["approve", "reject", "end"]


class AssignmentOut(BaseModel):
    assignment_id: int
    trainer_id: int
    trainee_id: int
    status: str
    start_date: datetime | None
    end_date: datetime | None
    trainer_name: str
    trainee_name: str


# ---------- exercises & rules ----------

class RuleIn(BaseModel):
    rule_name: str = Field(min_length=1, max_length=80)
    joint: str = Field(min_length=1, max_length=30)
    landmark_a: int = Field(ge=0, le=32)
    landmark_b: int = Field(ge=0, le=32)
    landmark_c: int = Field(ge=0, le=32)
    phase: Phase | None = None
    min_angle: float | None = Field(default=None, ge=0, le=180)
    max_angle: float | None = Field(default=None, ge=0, le=180)
    severity: Severity
    error_message: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def _range(self):
        if self.min_angle is None and self.max_angle is None:
            raise ValueError("יש להגדיר זווית מינימלית או מקסימלית")
        if self.min_angle is not None and self.max_angle is not None and self.min_angle > self.max_angle:
            raise ValueError("הזווית המינימלית גדולה מהמקסימלית")
        return self


class RuleOut(ORM):
    rule_id: int
    exercise_id: int
    rule_name: str
    joint: str
    landmark_a: int
    landmark_b: int
    landmark_c: int
    phase: Phase | None
    min_angle: float | None
    max_angle: float | None
    severity: Severity
    error_message: str


class ExerciseIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    description: str | None = None
    muscle_group: str | None = Field(default=None, max_length=40)
    camera_view: Literal["Front", "Side"]
    demo_video_url: str | None = Field(default=None, max_length=255)
    is_active: bool = True


class ExerciseOut(ORM):
    exercise_id: int
    name: str
    description: str | None
    muscle_group: str | None
    camera_view: Literal["Front", "Side"]
    demo_video_url: str | None
    is_active: bool
    rules: list[RuleOut] = []


# ---------- plans & goals ----------

class PlanExerciseIn(BaseModel):
    exercise_id: int
    target_sets: int = Field(ge=1, le=10)
    target_reps: int = Field(ge=1, le=50)
    rest_seconds: int = Field(default=60, ge=0, le=600)


class GoalIn(BaseModel):
    goal_type: str = Field(min_length=1, max_length=50)
    target_value: float | None = None
    target_date: date | None = None


class PlanIn(BaseModel):
    trainee_id: int
    name: str = Field(min_length=1, max_length=80)
    start_date: date
    end_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    exercises: list[PlanExerciseIn] = Field(min_length=1, max_length=20)
    goals: list[GoalIn] = []


class PlanExerciseOut(ORM):
    plan_exercise_id: int
    exercise_id: int
    order_index: int
    target_sets: int
    target_reps: int
    rest_seconds: int
    exercise: ExerciseOut


class GoalOut(ORM):
    goal_id: int
    goal_type: str
    target_value: float | None
    target_date: date | None
    status: str


class PlanOut(ORM):
    plan_id: int
    trainer_id: int
    trainee_id: int
    name: str
    start_date: date
    end_date: date | None
    notes: str | None
    exercises: list[PlanExerciseOut]
    goals: list[GoalOut] = []


# ---------- sessions, sets, reps ----------

class SessionIn(BaseModel):
    plan_id: int | None = None
    started_at: datetime
    device_info: str | None = Field(default=None, max_length=120)


class ErrorIn(BaseModel):
    rule_id: int
    measured_value: float | None = Field(default=None, ge=-360, le=360)
    occurred_at: datetime
    feedback_text: str | None = Field(default=None, max_length=200)


class RepIn(BaseModel):
    rep_number: int = Field(ge=1, le=200)
    duration_ms: int | None = Field(default=None, ge=0, le=120_000)
    min_angle_deg: float | None = Field(default=None, ge=0, le=180)
    max_angle_deg: float | None = Field(default=None, ge=0, le=180)
    reached_depth: bool
    errors: list[ErrorIn] = []


class SetIn(BaseModel):
    exercise_id: int
    set_number: int = Field(ge=1, le=50)
    started_at: datetime
    ended_at: datetime
    reps: list[RepIn] = Field(default_factory=list, max_length=200)

    @field_validator("reps")
    @classmethod
    def _unique_rep_numbers(cls, v: list[RepIn]):
        nums = [r.rep_number for r in v]
        if len(nums) != len(set(nums)):
            raise ValueError("מספרי חזרות כפולים")
        return v


class FinishIn(BaseModel):
    status: Literal["Done", "Aborted"]
    ended_at: datetime


class SetOut(ORM):
    set_id: int
    session_id: int
    exercise_id: int
    set_number: int
    total_reps: int
    valid_reps: int
    technique_score: float | None
    avg_rom_deg: float | None


class SessionOut(ORM):
    session_id: int
    trainee_id: int
    plan_id: int | None
    started_at: datetime
    ended_at: datetime | None
    status: str
    avg_technique_score: float | None
    report_id: int | None = None
    exercises: list[str] = []
    total_reps: int = 0


class FinishOut(BaseModel):
    session: SessionOut
    report_job: str | None
    report_queued: bool
    report_id: int | None


# ---------- reports ----------

class NoteIn(BaseModel):
    note_text: str = Field(min_length=1, max_length=2000)


class NoteOut(BaseModel):
    note_id: int
    trainer_id: int
    trainer_name: str
    note_text: str
    created_at: datetime


class SendIn(BaseModel):
    channel: Literal["Email", "InApp"] = "InApp"
    file_format: Literal["PDF", "XLSX", "JSON"] = "PDF"


class ReportOut(BaseModel):
    report_id: int
    session_id: int
    trainee_id: int
    trainee_name: str
    generated_at: datetime
    status: str
    total_reps: int
    valid_reps: int
    avg_score: float | None
    improvement_pct: float | None
    summary: dict
    notes: list[NoteOut]
    session_status: str
    started_at: datetime


class JobOut(BaseModel):
    job_id: str
    status: str
    result: dict | None = None
    error: str | None = None


# ---------- admin ----------

class UserAdminUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


class AuditOut(ORM):
    log_id: int
    user_id: int | None
    action: str
    entity_name: str | None
    entity_id: int | None
    ip_address: str | None
    created_at: datetime


class RumIn(BaseModel):
    name: str = Field(max_length=40)
    value: float
    page: str | None = Field(default=None, max_length=120)
    device: str | None = Field(default=None, max_length=160)
