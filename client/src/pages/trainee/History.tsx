/** Workout history (US-08): newest first, filter by exercise, score over time. */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { Exercise, SessionSummary } from "../../api/types";
import { SkeletonRows } from "../../components/Skeleton";
import { Sparkline } from "../../components/Sparkline";
import { VirtualList } from "../../components/VirtualList";
import { fmtDateTime, fmtScore, STATUS_HE } from "../../lib/format";

export default function History() {
  const [exercise, setExercise] = useState<string>("");
  const exercises = useQuery({ queryKey: ["exercises"], queryFn: () => api<Exercise[]>("/exercises"), staleTime: 3600_000 });
  const sessions = useQuery({
    queryKey: ["my-sessions", exercise],
    queryFn: () => api<SessionSummary[]>(`/me/sessions?limit=200${exercise ? `&exercise_id=${exercise}` : ""}`),
  });
  const scores = (sessions.data ?? []).filter((s) => s.avg_technique_score != null).map((s) => s.avg_technique_score!) ;

  return (
    <div className="stack">
      <div className="spread">
        <h1>היסטוריית אימונים</h1>
        <select value={exercise} onChange={(e) => setExercise(e.target.value)} style={{ maxWidth: 220 }} aria-label="סינון לפי תרגיל">
          <option value="">כל התרגילים</option>
          {exercises.data?.map((e) => (
            <option key={e.exercise_id} value={e.exercise_id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      <div className="card">
        <h3>ציון טכניקה לאורך זמן</h3>
        <Sparkline values={scores.slice(0, 30)} />
      </div>
      {sessions.isLoading ? (
        <SkeletonRows />
      ) : (
        <VirtualList
          items={sessions.data ?? []}
          rowHeight={68}
          empty={<div className="card muted">עוד אין אימונים</div>}
          render={(s) => (
            <div className="listrow">
              <div>
                <b>{fmtDateTime(s.started_at)}</b>
                <div className="muted small">
                  {s.exercises.join(", ") || "—"} · {s.total_reps} חזרות · {STATUS_HE[s.status]}
                </div>
              </div>
              <div className="row">
                <span className="num">{fmtScore(s.avg_technique_score)}</span>
                {s.report_id && <Link to={`/reports/${s.report_id}`}>דוח</Link>}
              </div>
            </div>
          )}
        />
      )}
    </div>
  );
}
