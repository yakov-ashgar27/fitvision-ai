/** US-20 – audit log, read only, filter by user, action and date. */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { AuditRow } from "../../api/types";
import { SkeletonRows } from "../../components/Skeleton";
import { VirtualList } from "../../components/VirtualList";
import { fmtDateTime } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";

export default function Audit() {
  const [f, setF] = useState({ user_id: "", action: "", date_from: "", date_to: "" });
  const deb = useDebounced(f, 300);
  const qs = new URLSearchParams(Object.entries(deb).filter(([, v]) => v) as [string, string][]).toString();
  const q = useQuery({ queryKey: ["audit", qs], queryFn: () => api<AuditRow[]>(`/admin/audit-log${qs ? `?${qs}` : ""}`) });
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="stack">
      <h1>יומן פעולות</h1>
      <div className="card row">
        <label style={{ width: 110 }}>
          משתמש
          <input inputMode="numeric" value={f.user_id} onChange={set("user_id")} />
        </label>
        <label style={{ flex: 1, minWidth: 140 }}>
          פעולה
          <input value={f.action} onChange={set("action")} dir="ltr" />
        </label>
        <label style={{ width: 170 }}>
          מתאריך
          <input type="date" value={f.date_from} onChange={set("date_from")} />
        </label>
        <label style={{ width: 170 }}>
          עד תאריך
          <input type="date" value={f.date_to} onChange={set("date_to")} />
        </label>
      </div>
      {q.isLoading ? (
        <SkeletonRows />
      ) : (
        <VirtualList
          items={q.data ?? []}
          rowHeight={56}
          height={600}
          render={(r) => (
            <div className="listrow small">
              <span className="num" style={{ width: 130 }}>
                {fmtDateTime(r.created_at)}
              </span>
              <span className="num" style={{ flex: 1 }}>
                {r.action}
              </span>
              <span className="num">
                {r.entity_name ?? ""} {r.entity_id ?? ""}
              </span>
              <span className="muted num">user {r.user_id ?? "—"}</span>
            </div>
          )}
        />
      )}
    </div>
  );
}
