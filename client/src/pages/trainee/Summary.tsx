/** End-of-workout summary (US-07), built from the data on the phone, so it appears immediately (6.3.1). */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getWorkout, isSynced, LocalWorkout, onChange, sync } from "../../offline/sync";
import { fmtScore } from "../../lib/format";

export default function Summary() {
  const { localId } = useParams();
  const [w, setW] = useState<LocalWorkout | null>(null);
  useEffect(() => {
    const load = () => void getWorkout(localId!).then((x) => setW(x ?? null));
    load();
    void sync();
    return onChange(load);
  }, [localId]);
  if (!w) return <div className="card">טוען…</div>;

  const scores = w.sets.flatMap((s) => s.scores);
  const total = w.sets.reduce((n, s) => n + s.reps.length, 0);
  const validReps = w.sets.reduce((n, s) => n + (s.valid ?? 0), 0);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const counts = new Map<string, number>();
  for (const s of w.sets) for (const r of s.reps) for (const e of r.errors) counts.set(e.feedback_text ?? "", (counts.get(e.feedback_text ?? "") ?? 0) + 1);
  const top = [...counts.entries()].filter(([m]) => m).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const synced = isSynced(w);

  return (
    <div className="stack">
      <h1>{w.finish?.status === "Aborted" ? "האימון הופסק" : "כל הכבוד! האימון הסתיים"}</h1>
      <div className="kpis">
        <div className="card kpi">
          חזרות<b className="num" data-testid="summary-reps">{total}</b>
        </div>
        <div className="card kpi">
          סטים<b className="num">{w.sets.length}</b>
        </div>
        <div className="card kpi">
          ציון טכניקה<b className="num" data-testid="summary-score">{fmtScore(avg)}</b>
        </div>
        <div className="card kpi">
          חזרות תקינות<b className="num">{validReps}</b>
        </div>
      </div>
      <div className="card">
        <h3>מה לשפר</h3>
        {top.length ? (
          <ol>
            {top.map(([m, n]) => (
              <li key={m}>
                {m} <span className="muted small">({n} חזרות)</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="ok">לא זוהו שגיאות טכניקה</div>
        )}
      </div>
      <div className="card spread">
        <div data-testid="sync-status">
          {synced ? <span className="ok">נשמר בשרת</span> : <span className="warnc">נשמר במכשיר · יסונכרן כשיהיה חיבור</span>}
        </div>
        {w.reportId ? (
          <Link className="btn" to={`/reports/${w.reportId}`} data-testid="open-report">
            לדוח המלא
          </Link>
        ) : synced && w.finish?.status === "Aborted" && !w.sets.length ? (
          <span className="muted small">לא הושלם סט, ולכן לא הופק דוח</span>
        ) : null}
      </div>
      <Link to="/">חזרה לדף הבית</Link>
    </div>
  );
}
