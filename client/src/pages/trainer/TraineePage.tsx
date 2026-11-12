/** Trainee card for the trainer: profile, plan builder (US-11), trends (US-17), sessions and reports. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, lazy, Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { Assignment, Exercise, Plan, SessionSummary, Trends } from "../../api/types";
import { SkeletonRows } from "../../components/Skeleton";
import { fmtDateTime, fmtScore, STATUS_HE } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";

const TrendsChart = lazy(() => import("./TrendsChart"));

interface Detail {
  trainee_id: number;
  name: string;
  email: string;
  phone: string | null;
  assignment: Assignment;
  profile: { height_cm: number | null; weight_kg: number | null; fitness_level: string | null; injuries_notes: string | null } | null;
}

interface Row {
  exercise_id: number;
  target_sets: number;
  target_reps: number;
  rest_seconds: number;
}

export default function TraineePage() {
  const { id } = useParams();
  const tid = Number(id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [weeks, setWeeks] = useState(8);
  const [metric, setMetric] = useState<"score" | "rom">("score");
  const detail = useQuery({ queryKey: ["trainee", tid], queryFn: () => api<Detail>(`/trainees/${tid}`) });
  const trends = useQuery({ queryKey: ["trends", tid, weeks], queryFn: () => api<Trends>(`/trainees/${tid}/trends?weeks=${weeks}`) });
  const sessions = useQuery({ queryKey: ["sessions", tid], queryFn: () => api<SessionSummary[]>(`/sessions?trainee_id=${tid}&limit=50`) });
  const plans = useQuery({ queryKey: ["plans", tid], queryFn: () => api<Plan[]>(`/trainees/${tid}/plans`) });
  const exercises = useQuery({ queryKey: ["exercises"], queryFn: () => api<Exercise[]>("/exercises"), staleTime: 3600_000 });

  const current = plans.data?.[0];
  const [name, setName] = useState("תוכנית אימון");
  const [rows, setRows] = useState<Row[]>([]);
  const [goal, setGoal] = useState({ goal_type: "", target_value: "" });
  const [exSearch, setExSearch] = useState("");
  const exTerm = useDebounced(exSearch, 300);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (current) {
      setName(current.name);
      setRows(current.exercises.map((e) => ({ exercise_id: e.exercise_id, target_sets: e.target_sets, target_reps: e.target_reps, rest_seconds: e.rest_seconds })));
    }
  }, [current]);

  const savePlan = useMutation({
    mutationFn: () =>
      api<Plan>("/plans", {
        method: "POST",
        json: {
          trainee_id: tid,
          name,
          start_date: new Date().toISOString().slice(0, 10),
          exercises: rows,
          goals: goal.goal_type ? [{ goal_type: goal.goal_type, target_value: goal.target_value ? Number(goal.target_value) : null }] : [],
        },
      }),
    onSuccess: () => {
      setMsg("התוכנית נשמרה ומוצגת למתאמן");
      setGoal({ goal_type: "", target_value: "" });
      void qc.invalidateQueries({ queryKey: ["plans", tid] });
    },
    onError: (e) => setMsg((e as Error).message),
  });

  const remind = useMutation({ mutationFn: () => api(`/trainees/${tid}/remind`, { method: "POST" }), onSuccess: () => setMsg("התזכורת נשלחה") });
  const end = useMutation({
    mutationFn: () => api(`/assignments/${detail.data!.assignment.assignment_id}`, { method: "PATCH", json: { action: "end" } }),
    onSuccess: () => nav("/trainer"),
  });

  if (detail.isLoading) return <SkeletonRows />;
  if (detail.error || !detail.data) return <div className="card error">{(detail.error as Error)?.message}</div>;
  const d = detail.data;
  const available = (exercises.data ?? []).filter((e) => !rows.some((r) => r.exercise_id === e.exercise_id) && (!exTerm || e.name.includes(exTerm)));

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>{d.name}</h1>
          <div className="muted small">
            משויך מ-{fmtDateTime(d.assignment.start_date)} · {d.email}
          </div>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => remind.mutate()}>
            שליחת תזכורת
          </button>
          <button className="danger" onClick={() => window.confirm("לסיים את השיוך? הגישה לנתונים תיסגר מיד.") && end.mutate()}>
            סיום שיוך
          </button>
        </div>
      </div>
      {msg && <div className="banner">{msg}</div>}

      {d.profile && (
        <div className="card small">
          גובה {d.profile.height_cm ?? "—"} ס"מ · משקל {d.profile.weight_kg ?? "—"} ק"ג · רמה {d.profile.fitness_level ?? "—"}
          {d.profile.injuries_notes && <div>פציעות: {d.profile.injuries_notes}</div>}
        </div>
      )}

      <div className="card stack">
        <div className="spread">
          <h3>מגמות התקדמות</h3>
          <div className="row">
            <select value={metric} onChange={(e) => setMetric(e.target.value as "score" | "rom")} style={{ width: "auto" }}>
              <option value="score">ציון טכניקה</option>
              <option value="rom">טווח תנועה</option>
            </select>
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} style={{ width: "auto" }}>
              <option value={4}>4 שבועות</option>
              <option value={8}>8 שבועות</option>
              <option value={12}>12 שבועות</option>
            </select>
          </div>
        </div>
        <Suspense fallback={<SkeletonRows n={3} />}>{trends.data ? <TrendsChart data={trends.data} metric={metric} /> : <SkeletonRows n={3} />}</Suspense>
      </div>

      <form
        className="card stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          savePlan.mutate();
        }}
      >
        <h3>תוכנית אימון</h3>
        <label>
          שם התוכנית
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        {rows.map((r, i) => {
          const ex = exercises.data?.find((e) => e.exercise_id === r.exercise_id);
          const upd = (k: keyof Row) => (e: any) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)));
          return (
            <div className="listrow" key={r.exercise_id} style={{ flexWrap: "wrap" }}>
              <b style={{ minWidth: 110 }}>{ex?.name}</b>
              <label style={{ width: 80 }}>
                סטים
                <input type="number" min={1} max={10} value={r.target_sets} onChange={upd("target_sets")} />
              </label>
              <label style={{ width: 80 }}>
                חזרות
                <input type="number" min={1} max={50} value={r.target_reps} onChange={upd("target_reps")} />
              </label>
              <label style={{ width: 90 }}>
                מנוחה (ש')
                <input type="number" min={0} max={600} value={r.rest_seconds} onChange={upd("rest_seconds")} />
              </label>
              <button type="button" className="link" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                הסרה
              </button>
            </div>
          );
        })}
        <label>
          הוספת תרגיל מהמאגר
          <input value={exSearch} onChange={(e) => setExSearch(e.target.value)} placeholder="חיפוש תרגיל" />
        </label>
        <div className="row">
          {available.map((e) => (
            <button type="button" className="secondary" key={e.exercise_id} onClick={() => setRows([...rows, { exercise_id: e.exercise_id, target_sets: 3, target_reps: 10, rest_seconds: 60 }])}>
              + {e.name}
            </button>
          ))}
        </div>
        <div className="grid2">
          <label>
            יעד (לא חובה)
            <input value={goal.goal_type} onChange={(e) => setGoal({ ...goal, goal_type: e.target.value })} placeholder="למשל: ציון טכניקה ממוצע" />
          </label>
          <label>
            ערך יעד
            <input inputMode="decimal" value={goal.target_value} onChange={(e) => setGoal({ ...goal, target_value: e.target.value })} />
          </label>
        </div>
        <button type="submit" disabled={!rows.length || savePlan.isPending}>
          שמירת התוכנית
        </button>
      </form>

      <div className="card stack">
        <h3>אימונים</h3>
        {sessions.isLoading ? (
          <SkeletonRows n={3} />
        ) : !sessions.data?.length ? (
          <div className="muted">אין אימונים מאז תחילת השיוך</div>
        ) : (
          sessions.data.map((s) => (
            <div className="listrow" key={s.session_id}>
              <div>
                <b>{fmtDateTime(s.started_at)}</b>
                <div className="muted small">
                  {s.exercises.join(", ")} · {s.total_reps} חזרות · {STATUS_HE[s.status]}
                </div>
              </div>
              <div className="row">
                <span className="num">{fmtScore(s.avg_technique_score)}</span>
                {s.report_id && (
                  <Link to={`/reports/${s.report_id}`} data-testid="report-link">
                    דוח
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
