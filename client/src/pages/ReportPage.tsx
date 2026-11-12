/** Screen 5 – workout report. One request loads everything (6.3.2); trainer actions are optimistic (6.3.1). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, downloadFile, waitForJob } from "../api/client";
import type { Job, Note, Report } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { SkeletonCards, SkeletonRows } from "../components/Skeleton";
import { fmtDateTime, fmtPct, fmtScore, STATUS_HE } from "../lib/format";

export default function ReportPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["report", id];
  const q = useQuery({ queryKey: key, queryFn: () => api<Report>(`/reports/${id}`) });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const isTrainer = user?.role === "Trainer";

  const addNote = useMutation({
    mutationFn: (text: string) => api<Note>(`/reports/${id}/notes`, { method: "POST", json: { note_text: text } }),
    onMutate: async (text) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Report>(key);
      if (prev)
        qc.setQueryData<Report>(key, {
          ...prev,
          status: prev.status === "Draft" ? "Reviewed" : prev.status,
          notes: [...prev.notes, { note_id: -1, trainer_id: user!.user_id, trainer_name: `${user!.first_name} ${user!.last_name}`, note_text: text, created_at: new Date().toISOString().slice(0, 19) }],
        });
      setNote("");
      return { prev };
    },
    onError: (e, _t, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      setMsg((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  async function exportFile(fmt: "pdf" | "xlsx") {
    setBusy(fmt);
    setMsg(null);
    const t0 = performance.now();
    try {
      const job = await api<Job>(`/reports/${id}/export/${fmt}`, { method: "POST" });
      await waitForJob(job);
      await downloadFile(`/reports/${id}/files/${fmt}`, `fitvision-report-${id}.${fmt}`);
      setMsg(`הקובץ הופק תוך ${((performance.now() - t0) / 1000).toFixed(1)} שניות`);
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function send(channel: "InApp" | "Email") {
    setBusy("send");
    setMsg(null);
    const prev = qc.getQueryData<Report>(key);
    if (prev) qc.setQueryData<Report>(key, { ...prev, status: "Sent" });
    try {
      const job = await api<Job>(`/reports/${id}/send`, { method: "POST", json: { channel, file_format: "PDF" } });
      await waitForJob(job);
      setMsg(channel === "Email" ? "הדוח נשלח בדוא\"ל" : "הדוח נשלח למתאמן באפליקציה");
    } catch (e: any) {
      if (prev) qc.setQueryData(key, prev);
      setMsg(e.message);
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: key });
    }
  }

  if (q.isLoading)
    return (
      <div className="stack">
        <SkeletonCards />
        <SkeletonRows />
      </div>
    );
  if (q.error || !q.data) return <div className="card error">{(q.error as Error)?.message ?? "הדוח לא נמצא"}</div>;
  const r = q.data;
  const s = r.summary;

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>
            {s.exercises.map((e) => e.name).join(" · ") || "דוח אימון"} – {r.trainee_name}
          </h1>
          <div className="muted small">
            {fmtDateTime(r.started_at)} · {STATUS_HE[r.session_status]} · <span className="pill" data-testid="report-status">{STATUS_HE[r.status]}</span>
          </div>
        </div>
        {isTrainer && (
          <div className="row">
            <button className="secondary" disabled={!!busy} onClick={() => exportFile("pdf")} data-testid="export-pdf">
              {busy === "pdf" ? "מפיק…" : "PDF"}
            </button>
            <button className="secondary" disabled={!!busy} onClick={() => exportFile("xlsx")} data-testid="export-xlsx">
              {busy === "xlsx" ? "מפיק…" : "Excel"}
            </button>
            <button disabled={!!busy} onClick={() => send("InApp")} data-testid="send-report">
              שליחה למתאמן
            </button>
            <button className="secondary" disabled={!!busy} onClick={() => send("Email")}>
              בדוא"ל
            </button>
          </div>
        )}
      </div>
      {msg && <div className="banner">{msg}</div>}

      <div className="kpis">
        <div className="card kpi">
          חזרות<b className="num">{s.total_reps}</b>
        </div>
        <div className="card kpi">
          תקינות<b className="num">{s.valid_reps}</b>
        </div>
        <div className="card kpi">
          ציון טכניקה<b className="num" data-testid="report-score">{fmtScore(s.avg_score)}</b>
        </div>
        <div className="card kpi">
          מגמה מול 3 אימונים קודמים<b className="num">{s.improvement_pct == null ? "—" : fmtPct(s.improvement_pct)}</b>
        </div>
      </div>

      {s.exercises.map((ex) => (
        <div className="card stack" key={ex.exercise_id}>
          <div className="spread">
            <h3>{ex.name}</h3>
            <span className="muted small">
              {ex.camera_view === "Front" ? "מבט חזית" : "מבט צד"} · ציון {fmtScore(ex.score)} · מגמה{" "}
              {ex.trend.enough_data ? fmtPct(ex.trend.improvement_pct) : "אין מספיק נתונים"}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>סט</th>
                  <th>חזרות</th>
                  <th>תקינות</th>
                  <th>ציון</th>
                  <th>טווח תנועה</th>
                </tr>
              </thead>
              <tbody>
                {ex.sets.map((st) => (
                  <tr key={st.set_number}>
                    <td>{st.set_number}</td>
                    <td>{st.total_reps}</td>
                    <td>{st.valid_reps}</td>
                    <td className="num">{fmtScore(st.technique_score)}</td>
                    <td className="num">{st.avg_rom_deg == null ? "—" : `${st.avg_rom_deg}°`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ex.failure_points.length ? (
            <div>
              <b>נקודות כשל</b>
              <ul data-testid="failure-points">
                {ex.failure_points.map((f) => (
                  <li key={f.rule_id}>
                    <span className={`pill ${f.severity}`}>{f.severity}</span> {f.message} – {f.pct}% מהחזרות (סט {f.set_number})
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="ok small">לא נמצאו נקודות כשל</div>
          )}
        </div>
      ))}

      <div className="card stack">
        <h3>הערות המאמן</h3>
        {r.notes.length ? (
          r.notes.map((n) => (
            <div key={n.note_id} className="listrow" style={{ display: "block" }}>
              <b>{n.trainer_name}</b> <span className="muted small">{fmtDateTime(n.created_at)}</span>
              <div>{n.note_text}</div>
            </div>
          ))
        ) : (
          <div className="muted">אין הערות</div>
        )}
        {isTrainer && (
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (note.trim()) addNote.mutate(note.trim());
            }}
          >
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="הנחיה מקצועית למתאמן…" data-testid="note-input" />
            <button type="submit" disabled={!note.trim()} data-testid="add-note">
              הוספת הערה
            </button>
          </form>
        )}
      </div>
      {isTrainer && <Link to={`/trainer/trainees/${r.trainee_id}`}>לכרטיס המתאמן</Link>}
    </div>
  );
}
