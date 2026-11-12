import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { SkeletonRows } from "../../components/Skeleton";
import { fmtDateTime, fmtScore, STATUS_HE } from "../../lib/format";

interface Row {
  report_id: number;
  generated_at: string;
  status: string;
  avg_score: number | null;
  started_at: string;
  sent_at: string | null;
  opened_at: string | null;
  exercises?: string[];
}

export default function MyReports() {
  const q = useQuery({ queryKey: ["my-reports"], queryFn: () => api<Row[]>("/me/reports") });
  return (
    <div className="stack">
      <h1>הדוחות שלי</h1>
      {q.isLoading ? (
        <SkeletonRows />
      ) : !q.data?.length ? (
        <div className="card muted">אין עדיין דוחות</div>
      ) : (
        <div className="card">
          {q.data.map((r) => (
            <div className="listrow" key={r.report_id}>
              <div>
                <b>{r.exercises?.length ? r.exercises.join(" · ") : "אימון"}</b>
                <div className="small">{fmtDateTime(r.started_at)}</div>
                <div className="muted small">
                  {r.sent_at ? (r.opened_at ? "דוח מהמאמן · נקרא" : <b>דוח חדש מהמאמן</b>) : STATUS_HE[r.status]}
                </div>
              </div>
              <div className="row">
                <span className="num">{fmtScore(r.avg_score)}</span>
                <Link to={`/reports/${r.report_id}`}>פתיחה</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
