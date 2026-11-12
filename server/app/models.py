"""The 17 tables of the FitVision AI data model (section 4.3, FitVision_ERD.drawio).

Text that may contain Hebrew uses Unicode types, which map to NVARCHAR in SQL Server.
Indexes follow table 6.5 (section 6.3.3).
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Unicode,
    UnicodeText,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# BIGINT identity in SQL Server; INTEGER in SQLite so the column stays an autoincrement rowid alias.
BigId = BigInteger().with_variant(Integer, "sqlite")


def _enum(*values: str, name: str) -> Enum:
    # VARCHAR + CHECK constraint on every backend (no native enum in SQL Server)
    return Enum(*values, name=name, native_enum=False, create_constraint=True, length=20)


ROLE = _enum("Trainee", "Trainer", "Admin", name="role")
ASSIGN_STATUS = _enum("Pending", "Active", "Ended", name="assign_status")
SESSION_STATUS = _enum("InProgress", "Done", "Aborted", name="session_status")
REPORT_STATUS = _enum("Draft", "Reviewed", "Sent", name="report_status")
PHASE = _enum("Down", "Bottom", "Up", name="phase")
SEVERITY = _enum("Low", "Med", "High", name="severity")
CAMERA_VIEW = _enum("Front", "Side", name="camera_view")
FITNESS = _enum("Beginner", "Intermediate", "Advanced", name="fitness_level")
GOAL_STATUS = _enum("Active", "Achieved", "Dropped", name="goal_status")
CHANNEL = _enum("Email", "InApp", name="channel")
FILE_FORMAT = _enum("PDF", "XLSX", "JSON", name="file_format")


class User(Base):
    __tablename__ = "Users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(Unicode(50), nullable=False)
    last_name: Mapped[str] = mapped_column(Unicode(50), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    role: Mapped[str] = mapped_column(ROLE, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.current_timestamp())
    last_login: Mapped[datetime | None] = mapped_column(DateTime)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime)  # NFR-08

    trainee_profile: Mapped[TraineeProfile | None] = relationship(back_populates="user", uselist=False)
    trainer_profile: Mapped[TrainerProfile | None] = relationship(back_populates="user", uselist=False)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class TraineeProfile(Base):
    __tablename__ = "TraineeProfiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id", ondelete="CASCADE"), primary_key=True)
    birth_date: Mapped[date | None] = mapped_column(Date)
    gender: Mapped[str | None] = mapped_column(String(1))
    height_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    fitness_level: Mapped[str | None] = mapped_column(FITNESS)
    injuries_notes: Mapped[str | None] = mapped_column(UnicodeText)
    user: Mapped[User] = relationship(back_populates="trainee_profile")


class TrainerProfile(Base):
    __tablename__ = "TrainerProfiles"
    user_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id", ondelete="CASCADE"), primary_key=True)
    certification: Mapped[str | None] = mapped_column(Unicode(100))
    specialization: Mapped[str | None] = mapped_column(Unicode(100))
    bio: Mapped[str | None] = mapped_column(UnicodeText)
    invite_code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)  # US-03
    user: Mapped[User] = relationship(back_populates="trainer_profile")


class TrainerTraineeAssignment(Base):
    __tablename__ = "TrainerTraineeAssignments"
    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trainer_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    trainee_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    status: Mapped[str] = mapped_column(ASSIGN_STATUS, nullable=False, default="Pending")
    start_date: Mapped[datetime | None] = mapped_column(DateTime)  # access starts here (BR-09)
    end_date: Mapped[datetime | None] = mapped_column(DateTime)
    trainer: Mapped[User] = relationship(foreign_keys=[trainer_id])
    trainee: Mapped[User] = relationship(foreign_keys=[trainee_id])
    __table_args__ = (
        Index("IX_Assign_trainer_status", "trainer_id", "status", mssql_include=["trainee_id", "start_date"]),
        Index("IX_Assign_trainee_status", "trainee_id", "status"),
    )


class Goal(Base):
    __tablename__ = "Goals"
    goal_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trainee_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    set_by_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    goal_type: Mapped[str] = mapped_column(Unicode(50), nullable=False)
    target_value: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    target_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(GOAL_STATUS, nullable=False, default="Active")


class Exercise(Base):
    __tablename__ = "Exercises"
    exercise_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("Users.user_id"))
    name: Mapped[str] = mapped_column(Unicode(60), nullable=False)
    description: Mapped[str | None] = mapped_column(UnicodeText)
    muscle_group: Mapped[str | None] = mapped_column(Unicode(40))
    camera_view: Mapped[str] = mapped_column(CAMERA_VIEW, nullable=False)
    demo_video_url: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rules: Mapped[list[TechniqueRule]] = relationship(back_populates="exercise", order_by="TechniqueRule.rule_id")


class TechniqueRule(Base):
    __tablename__ = "TechniqueRules"
    rule_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("Exercises.exercise_id"), nullable=False)
    rule_name: Mapped[str] = mapped_column(Unicode(80), nullable=False)
    joint: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    landmark_a: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    landmark_b: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # vertex
    landmark_c: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    phase: Mapped[str | None] = mapped_column(PHASE)  # NULL = all phases
    min_angle: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    max_angle: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    severity: Mapped[str] = mapped_column(SEVERITY, nullable=False)
    error_message: Mapped[str] = mapped_column(Unicode(200), nullable=False)
    exercise: Mapped[Exercise] = relationship(back_populates="rules")
    __table_args__ = (
        CheckConstraint("landmark_a BETWEEN 0 AND 32 AND landmark_b BETWEEN 0 AND 32 AND landmark_c BETWEEN 0 AND 32",
                        name="CK_Rule_landmarks"),
        CheckConstraint("min_angle IS NOT NULL OR max_angle IS NOT NULL", name="CK_Rule_range"),
    )


class WorkoutPlan(Base):
    __tablename__ = "WorkoutPlans"
    plan_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trainer_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    trainee_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    name: Mapped[str] = mapped_column(Unicode(80), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(UnicodeText)
    exercises: Mapped[list[PlanExercise]] = relationship(
        back_populates="plan", order_by="PlanExercise.order_index", cascade="all, delete-orphan"
    )


class PlanExercise(Base):
    __tablename__ = "PlanExercises"
    plan_exercise_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("WorkoutPlans.plan_id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("Exercises.exercise_id"), nullable=False)
    order_index: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    target_sets: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    target_reps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    rest_seconds: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=60)
    plan: Mapped[WorkoutPlan] = relationship(back_populates="exercises")
    exercise: Mapped[Exercise] = relationship()


class WorkoutSession(Base):
    __tablename__ = "WorkoutSessions"
    session_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    trainee_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("WorkoutPlans.plan_id"))
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(SESSION_STATUS, nullable=False, default="InProgress")
    device_info: Mapped[str | None] = mapped_column(String(120))
    avg_technique_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    sets: Mapped[list[ExerciseSet]] = relationship(back_populates="session", order_by="ExerciseSet.set_number")
    report: Mapped[Report | None] = relationship(back_populates="session", uselist=False)
    __table_args__ = (
        Index("IX_Sessions_trainee_started", "trainee_id", "started_at",
              mssql_include=["status", "avg_technique_score"]),
    )


class ExerciseSet(Base):
    __tablename__ = "ExerciseSets"
    set_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("WorkoutSessions.session_id"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("Exercises.exercise_id"), nullable=False)
    set_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    total_reps: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    valid_reps: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    technique_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    avg_rom_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    session: Mapped[WorkoutSession] = relationship(back_populates="sets")
    exercise: Mapped[Exercise] = relationship()
    reps: Mapped[list[Repetition]] = relationship(back_populates="set", order_by="Repetition.rep_number")
    errors: Mapped[list[FormErrorEvent]] = relationship(back_populates="set")
    # idempotent sync from IndexedDB (NFR-12, table 6.5)
    __table_args__ = (UniqueConstraint("session_id", "set_number", name="UQ_Sets_session_setnum"),)


class Repetition(Base):
    __tablename__ = "Repetitions"
    rep_id: Mapped[int] = mapped_column(BigId, primary_key=True)
    set_id: Mapped[int] = mapped_column(ForeignKey("ExerciseSets.set_id"), nullable=False, index=True)
    rep_number: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    min_angle_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    max_angle_deg: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    set: Mapped[ExerciseSet] = relationship(back_populates="reps")


class FormErrorEvent(Base):
    __tablename__ = "FormErrorEvents"
    event_id: Mapped[int] = mapped_column(BigId, primary_key=True)
    set_id: Mapped[int] = mapped_column(ForeignKey("ExerciseSets.set_id"), nullable=False)
    rep_id: Mapped[int | None] = mapped_column(ForeignKey("Repetitions.rep_id"))
    rule_id: Mapped[int] = mapped_column(ForeignKey("TechniqueRules.rule_id"), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    measured_value: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    feedback_text: Mapped[str | None] = mapped_column(Unicode(200))
    set: Mapped[ExerciseSet] = relationship(back_populates="errors")
    rule: Mapped[TechniqueRule] = relationship()
    __table_args__ = (Index("IX_Errors_set_rule", "set_id", "rule_id"),)


class Report(Base):
    __tablename__ = "Reports"
    report_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("WorkoutSessions.session_id"), unique=True, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    total_reps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    valid_reps: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    avg_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    improvement_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    summary_json: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    file_path: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(REPORT_STATUS, nullable=False, default="Draft")
    session: Mapped[WorkoutSession] = relationship(back_populates="report")
    notes: Mapped[list[TrainerNote]] = relationship(back_populates="report", order_by="TrainerNote.created_at")
    __table_args__ = (Index("IX_Reports_status_generated", "status", "generated_at"),)


class TrainerNote(Base):
    __tablename__ = "TrainerNotes"
    note_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("Reports.report_id"), nullable=False)
    trainer_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    note_text: Mapped[str] = mapped_column(UnicodeText, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    report: Mapped[Report] = relationship(back_populates="notes")
    trainer: Mapped[User] = relationship()


class ReportDelivery(Base):
    __tablename__ = "ReportDeliveries"
    delivery_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("Reports.report_id"), nullable=False)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("Users.user_id"), nullable=False)
    channel: Mapped[str] = mapped_column(CHANNEL, nullable=False)
    file_format: Mapped[str] = mapped_column(FILE_FORMAT, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime)


class AuditLog(Base):
    __tablename__ = "AuditLog"
    log_id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("Users.user_id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_name: Mapped[str | None] = mapped_column(String(50))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    __table_args__ = (
        Index("IX_Audit_created", "created_at"),
        Index("IX_Audit_user_created", "user_id", "created_at"),
    )


ALL_TABLES = [m.__tablename__ for m in (
    User, TraineeProfile, TrainerProfile, TrainerTraineeAssignment, Goal, WorkoutPlan, PlanExercise, Exercise,
    TechniqueRule, WorkoutSession, ExerciseSet, Repetition, FormErrorEvent, Report, TrainerNote, ReportDelivery,
    AuditLog,
)]
assert len(ALL_TABLES) == 17
