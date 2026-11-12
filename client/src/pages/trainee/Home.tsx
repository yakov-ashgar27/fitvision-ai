/** Screen 1 – trainee home: today's plan, coach, last workout and goals. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { Exercise, Plan, SessionSummary } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { SkeletonCards, SkeletonRows } from "../../components/Skeleton";
import { fmtDateTime, fmtScore, STATUS_HE } from "../../lib/format";
import { startWorkout } from "../../offline/sync";
import { saveWorkout, WorkoutItem } from "../../workout";

export const EX_EMOJI: Record<string, string> = { "סקוואט": "🏋️", "לאנג'ים": "🦵", "כפיפת מרפקים": "💪", "לחיצת כתפיים": "🙌" };

/** Training streak (consecutive days up to today or yesterday), sessions this week and best score. */
export function streakStats(sessions: SessionSummary[], today = new Date()) {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const days = new Set(sessions.filter((s) => s.total_reps > 0).map((s) => day(new Date(s.started_at))));
  let streak = 0;
  const d = new Date(today);
  if (!days.has(day(d))) d.setDate(d.getDate() - 1);
  while (days.has(day(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  const weekAgo = today.getTime() - 7 * 864e5;
  const week = sessions.filter((s) => s.total_reps > 0 && Date.parse(s.started_at) >= weekAgo).length;
  const best = Math.max(0, ...sessions.map((s) => s.avg_technique_score ?? 0));
  return { streak, week, best: best || null };
}

export default function Home() {
  const { me, user, refresh } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const plan = useQuery({ queryKey: ["plan-active"], queryFn: () => api<Plan | null>("/plans/active") });
  const last = useQuery({ queryKey: ["my-sessions", 30], queryFn: () => api<SessionSummary[]>("/me/sessions?limit=30") });
  const exercises = useQuery({ queryKey: ["exercises"], queryFn: () => api<Exercise[]>("/exercises"), staleTime: 3600_000 });
  const [code, setCode] = useState("");
  const request = useMutation({
    mutationFn: (c: string) => api("/assignments", { method: "POST", json: { invite_code: c.toUpperCase() } }),
    onSuccess: async () => {
      setCode("");
      await refresh();
      void qc.invalidateQueries();
    },
  });

  async function begin(items: WorkoutItem[], planId: number | null) {
    const w = await startWorkout(user!.user_id, planId);
    saveWorkout({ localId: w.localId, planId, items, index: 0, setsDone: 0 });
    nav("/workout/setup");
  }

  const a = me?.assignment;
  return (
    <div className="stack">
      <div className="card hero">
        <h1>שלום {user?.first_name} 👋</h1>
        <div className="muted">{last.data?.length ? "מוכנים לאימון הבא?" : "האימון הראשון שלכם מחכה"}</div>
        {last.data && last.data.length > 0 && (
          <div className="hero-stats" data-testid="hero-stats">
            {(() => {
              const st = streakStats(last.data);
              return (
                <>
                  <span>🔥 {st.streak} ימים ברצף</span>
                  <span>📅 {st.week} אימונים השבוע</span>
                  {st.best !== null && <span>🏆 שיא {Math.round(st.best)}</span>}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {plan.isLoading ? (
        <SkeletonCards n={2} />
      ) : plan.data ? (
        <div className="card stack">
          <div className="spread">
            <h3>{plan.data.name}</h3>
            <span className="muted small">{plan.data.exercises.length} תרגילים</span>
          </div>
          {plan.data.exercises.map((pe) => (
            <div className="listrow" key={pe.plan_exercise_id}>
              <div>
                <b>
                  {EX_EMOJI[pe.exercise.name] ?? "⭐"} {pe.exercise.name}
                </b>
                <div className="muted small">
                  {pe.target_sets} סטים × {pe.target_reps} חזרות · {pe.exercise.camera_view === "Front" ? "מבט חזית" : "מבט צד"}
                </div>
              </div>
              <button className="secondary" onClick={() => begin([{ exercise: pe.exercise, target_sets: pe.target_sets, target_reps: pe.target_reps, rest_seconds: pe.rest_seconds }], plan.data!.plan_id)}>
                רק זה
              </button>
            </div>
          ))}
          <button className="big" data-testid="start-plan" onClick={() => begin(plan.data!.exercises.map((pe) => ({ exercise: pe.exercise, target_sets: pe.target_sets, target_reps: pe.target_reps, rest_seconds: pe.rest_seconds })), plan.data!.plan_id)}>
            התחלת אימון
          </button>
        </div>
      ) : (
        <div className="card stack">
          <h3>אימון חופשי</h3>
          <p className="muted small">אין עדיין תוכנית מהמאמן. אפשר להתאמן על כל אחד מהתרגילים:</p>
          {exercises.isLoading && <SkeletonRows n={2} />}
          {exercises.data?.map((ex) => (
            <div className="listrow" key={ex.exercise_id}>
              <div>
                <b>
                  {EX_EMOJI[ex.name] ?? "⭐"} {ex.name}
                </b>
                <div className="muted small">{ex.camera_view === "Front" ? "מבט חזית" : "מבט צד"} · 3 סטים × 10</div>
              </div>
              <button data-testid={`free-${ex.exercise_id}`} onClick={() => begin([{ exercise: ex, target_sets: 3, target_reps: 10, rest_seconds: 45 }], null)}>
                התחלה
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid2">
        <div className="card stack">
          <h3>המאמן שלי</h3>
          {a ? (
            <div>
              {a.trainer_name} · <span className="pill">{STATUS_HE[a.status]}</span>
              {a.status === "Pending" && <div className="muted small">הבקשה ממתינה לאישור המאמן</div>}
            </div>
          ) : (
            <form
              className="stack"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                request.mutate(code);
              }}
            >
              <label>
                קוד הזמנה מהמאמן
                <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={8} minLength={8} required dir="ltr" placeholder="ABCD1234" />
              </label>
              {request.error && <div className="error">{(request.error as Error).message}</div>}
              <button type="submit" disabled={request.isPending}>
                שליחת בקשת שיוך
              </button>
            </form>
          )}
        </div>
        <div className="card stack">
          <h3>האימון האחרון</h3>
          {last.isLoading ? (
            <SkeletonRows n={1} />
          ) : last.data?.[0] ? (
            <div>
              <div>{fmtDateTime(last.data[0].started_at)}</div>
              <div className="muted small">
                {last.data[0].exercises.join(", ")} · {last.data[0].total_reps} חזרות · ציון {fmtScore(last.data[0].avg_technique_score)}
              </div>
              <Link to="/history">לכל ההיסטוריה</Link>
            </div>
          ) : (
            <div className="muted">עוד לא התאמנתם</div>
          )}
        </div>
      </div>

      {!!me?.goals?.length && (
        <div className="card">
          <h3>היעדים שלי</h3>
          {me.goals.map((g) => (
            <div key={g.goal_id} className="small">
              {g.goal_type}
              {g.target_value != null && <> · יעד {g.target_value}</>}
              {g.target_date && <> · עד {new Date(g.target_date).toLocaleDateString("he-IL")}</>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
