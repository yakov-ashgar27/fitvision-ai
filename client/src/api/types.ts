export type Role = "Trainee" | "Trainer" | "Admin";
export type Phase = "Down" | "Bottom" | "Up";
export type Severity = "Low" | "Med" | "High";

export interface User {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  consent_at: string | null;
  created_at?: string | null;
  last_login?: string | null;
}

export interface Assignment {
  assignment_id: number;
  trainer_id: number;
  trainee_id: number;
  status: "Pending" | "Active" | "Ended";
  start_date: string | null;
  end_date: string | null;
  trainer_name: string;
  trainee_name: string;
}

export interface Goal {
  goal_id: number;
  goal_type: string;
  target_value: number | null;
  target_date: string | null;
  status: string;
}

export interface Me {
  user: User;
  trainee?: {
    birth_date: string | null;
    gender: string | null;
    height_cm: number | null;
    weight_kg: number | null;
    fitness_level: string | null;
    injuries_notes: string | null;
  } | null;
  trainer?: { certification: string | null; specialization: string | null; bio: string | null; invite_code: string } | null;
  assignment?: Assignment | null;
  goals?: Goal[];
}

export interface Rule {
  rule_id: number;
  exercise_id: number;
  rule_name: string;
  joint: string;
  landmark_a: number;
  landmark_b: number;
  landmark_c: number;
  phase: Phase | null;
  min_angle: number | null;
  max_angle: number | null;
  severity: Severity;
  error_message: string;
}

export interface Exercise {
  exercise_id: number;
  name: string;
  description: string | null;
  muscle_group: string | null;
  camera_view: "Front" | "Side";
  demo_video_url: string | null;
  is_active: boolean;
  rules: Rule[];
}

export interface PlanExercise {
  plan_exercise_id: number;
  exercise_id: number;
  order_index: number;
  target_sets: number;
  target_reps: number;
  rest_seconds: number;
  exercise: Exercise;
}

export interface Plan {
  plan_id: number;
  trainer_id: number;
  trainee_id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  exercises: PlanExercise[];
  goals: Goal[];
}

export interface SessionSummary {
  session_id: number;
  trainee_id: number;
  plan_id: number | null;
  started_at: string;
  ended_at: string | null;
  status: "InProgress" | "Done" | "Aborted";
  avg_technique_score: number | null;
  report_id: number | null;
  exercises: string[];
  total_reps: number;
}

export interface ErrorIn {
  rule_id: number;
  measured_value: number | null;
  occurred_at: string;
  feedback_text?: string | null;
}

export interface RepIn {
  rep_number: number;
  duration_ms: number | null;
  min_angle_deg: number | null;
  max_angle_deg: number | null;
  reached_depth: boolean;
  errors: ErrorIn[];
}

export interface SetIn {
  exercise_id: number;
  set_number: number;
  started_at: string;
  ended_at: string;
  reps: RepIn[];
}

export interface FailurePoint {
  rule_id: number;
  rule_name: string;
  message: string;
  severity: Severity;
  pct: number;
  set_number: number;
}

export interface ReportExercise {
  exercise_id: number;
  name: string;
  camera_view: "Front" | "Side";
  total_reps: number;
  valid_reps: number;
  score: number | null;
  trend: { previous: number[]; improvement_pct: number | null; enough_data: boolean };
  failure_points: FailurePoint[];
  sets: {
    set_number: number;
    total_reps: number;
    valid_reps: number;
    technique_score: number | null;
    avg_rom_deg: number | null;
    reps: { rep_number: number; score: number; is_valid: boolean; min_angle_deg: number | null; max_angle_deg: number | null; duration_ms: number | null }[];
  }[];
}

export interface Report {
  report_id: number;
  session_id: number;
  trainee_id: number;
  trainee_name: string;
  generated_at: string;
  status: "Draft" | "Reviewed" | "Sent";
  total_reps: number;
  valid_reps: number;
  avg_score: number | null;
  improvement_pct: number | null;
  summary: {
    total_reps: number;
    valid_reps: number;
    avg_score: number | null;
    improvement_pct: number | null;
    top_errors: { message: string; count: number }[];
    exercises: ReportExercise[];
  };
  notes: Note[];
  session_status: string;
  started_at: string;
}

export interface Note {
  note_id: number;
  trainer_id: number;
  trainer_name: string;
  note_text: string;
  created_at: string;
}

export interface Alert {
  kind: "repeat_error" | "score_drop" | "inactivity";
  trainee_id: number;
  trainee_name: string;
  severity: Severity;
  message: string;
}

export interface Dashboard {
  kpis: { active_trainees: number; sessions_week: number; avg_score_week: number | null; reports_to_review: number };
  trainees: {
    trainee_id: number;
    name: string;
    since: string | null;
    last_session: string | null;
    avg_score: number | null;
    sessions_4w: number;
    trend_pct: number | null;
    alerts: number;
    assignment_id: number;
  }[];
  alerts: Alert[];
  requests: Assignment[];
  cached: boolean;
}

export interface Trends {
  weeks: number;
  exercises: { exercise_id: number; name: string; points: { week: string; score: number | null; rom: number | null; reps: number }[] }[];
}

export interface Job {
  job_id: string;
  status: string;
  result?: Record<string, unknown> | null;
  error?: string | null;
}

export interface AuditRow {
  log_id: number;
  user_id: number | null;
  action: string;
  entity_name: string | null;
  entity_id: number | null;
  ip_address: string | null;
  created_at: string;
}
