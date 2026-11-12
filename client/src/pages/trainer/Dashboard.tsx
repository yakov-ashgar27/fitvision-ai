/** Screen 4 – trainer dashboard: KPIs, alerts, requests and the trainees table, all from one request. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import type { Dashboard as D } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { SkeletonCards, SkeletonRows } from "../../components/Skeleton";
import { VirtualList } from "../../components/VirtualList";
import { daysAgo, fmtDate, fmtPct, fmtScore } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";

type SortKey = "name" | "last_session" | "avg_score" | "trend_pct" | "alerts";

export default function Dashboard() {
  const { me } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<D>("/dashboard"), refetchInterval: 60_000 });
  const [search, setSearch] = useState("");
  const term = useDebounced(search, 300);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "alerts", dir: -1 });

  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "reject" }) => api(`/assignments/${id}`, { method: "PATCH", json: { action } }),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ["dashboard"] });
      const prev = qc.getQueryData<D>(["dashboard"]);
      if (prev) qc.setQueryData<D>(["dashboard"], { ...prev, requests: prev.requests.filter((r) => r.assignment_id !== id) });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["dashboard"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const rows = useMemo(() => {
    const list = (q.data?.trainees ?? []).filter((t) => !term || t.name.includes(term));
    return [...list].sort((a, b) => {
      const va = a[sort.key] ?? -Infinity, vb = b[sort.key] ?? -Infinity;
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  }, [q.data, term, sort]);

  const th = (key: SortKey, label: string) => (
    <button className="link" onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : -1 })}>
      {label}
      {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </button>
  );

  return (
    <div className="stack">
      <div className="spread">
        <h1>דשבורד מאמן</h1>
        {me?.trainer && (
          <span className="muted small">
            קוד הזמנה: <b className="num" data-testid="invite-code">{me.trainer.invite_code}</b>
          </span>
        )}
      </div>

      {q.isLoading ? (
        <>
          <SkeletonCards />
          <SkeletonRows />
        </>
      ) : q.error ? (
        <div className="card error">{(q.error as Error).message}</div>
      ) : (
        q.data && (
          <>
            <div className="kpis">
              <div className="card kpi">
                מתאמנים פעילים<b className="num" data-testid="kpi-active">{q.data.kpis.active_trainees}</b>
              </div>
              <div className="card kpi">
                אימונים השבוע<b className="num">{q.data.kpis.sessions_week}</b>
              </div>
              <div className="card kpi">
                ציון ממוצע השבוע<b className="num">{fmtScore(q.data.kpis.avg_score_week)}</b>
              </div>
              <div className="card kpi">
                דוחות לסקירה<b className="num">{q.data.kpis.reports_to_review}</b>
              </div>
            </div>

            {!!q.data.requests.length && (
              <div className="card stack">
                <h3>בקשות שיוך</h3>
                {q.data.requests.map((r) => (
                  <div className="listrow" key={r.assignment_id}>
                    <span>{r.trainee_name}</span>
                    <div className="row">
                      <button onClick={() => act.mutate({ id: r.assignment_id, action: "approve" })} data-testid="approve">
                        אישור
                      </button>
                      <button className="secondary" onClick={() => act.mutate({ id: r.assignment_id, action: "reject" })}>
                        דחייה
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card stack">
              <h3>התראות</h3>
              {q.data.alerts.length ? (
                q.data.alerts.map((a, i) => (
                  <div className="listrow" key={i} style={{ cursor: "pointer" }} onClick={() => nav(`/trainer/trainees/${a.trainee_id}`)}>
                    <span>
                      <span className={`pill ${a.severity}`}>{a.severity === "High" ? "גבוהה" : a.severity === "Med" ? "בינונית" : "נמוכה"}</span> {a.message}
                    </span>
                  </div>
                ))
              ) : (
                <div className="muted">אין התראות פתוחות</div>
              )}
            </div>

            <div className="card stack">
              <div className="spread">
                <h3>המתאמנים שלי</h3>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש מתאמן" style={{ maxWidth: 240 }} aria-label="חיפוש מתאמן" />
              </div>
              <div className="listrow small muted" style={{ fontWeight: 600 }}>
                {th("name", "שם")}
                {th("last_session", "אימון אחרון")}
                {th("avg_score", "ציון (4 שבועות)")}
                {th("trend_pct", "מגמה")}
                {th("alerts", "התראות")}
              </div>
              <VirtualList
                items={rows}
                rowHeight={58}
                empty={<div className="muted">אין עדיין מתאמנים משויכים. שתפו את קוד ההזמנה.</div>}
                render={(t) => (
                  <Link to={`/trainer/trainees/${t.trainee_id}`} className="listrow" style={{ textDecoration: "none", color: "inherit" }} data-testid="trainee-row">
                    <b style={{ flex: 1.4 }}>{t.name}</b>
                    <span style={{ flex: 1 }} className="small">
                      {t.last_session ? `${fmtDate(t.last_session)} (${daysAgo(t.last_session)} ימים)` : "—"}
                    </span>
                    <span style={{ flex: 0.8 }} className="num">{fmtScore(t.avg_score)}</span>
                    <span style={{ flex: 0.8 }} className={`num ${t.trend_pct != null && t.trend_pct < 0 ? "bad" : "ok"}`}>
                      {fmtPct(t.trend_pct)}
                    </span>
                    <span style={{ flex: 0.6 }}>{t.alerts ? <span className="pill High">{t.alerts}</span> : "—"}</span>
                  </Link>
                )}
              />
            </div>
          </>
        )
      )}
    </div>
  );
}
