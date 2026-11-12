/** US-18 – user and role management. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import type { Role, User } from "../../api/types";
import { SkeletonRows } from "../../components/Skeleton";
import { VirtualList } from "../../components/VirtualList";
import { fmtDateTime } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";

const ROLE_HE: Record<Role, string> = { Trainee: "מתאמן", Trainer: "מאמן", Admin: "מנהל" };

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const term = useDebounced(search, 300);
  const q = useQuery({ queryKey: ["users", term], queryFn: () => api<User[]>(`/admin/users${term ? `?q=${encodeURIComponent(term)}` : ""}`) });
  const [err, setErr] = useState<string | null>(null);
  const upd = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<Pick<User, "role" | "is_active">> }) => api<User>(`/admin/users/${id}`, { method: "PATCH", json: body }),
    onMutate: async ({ id, body }) => {
      const key = ["users", term];
      const prev = qc.getQueryData<User[]>(key);
      if (prev) qc.setQueryData<User[]>(key, prev.map((u) => (u.user_id === id ? { ...u, ...body } : u)));
      setErr(null);
      return { prev, key };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      setErr((e as Error).message);
    },
  });

  return (
    <div className="stack">
      <div className="spread">
        <h1>ניהול משתמשים</h1>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש לפי שם או דוא״ל" style={{ maxWidth: 280 }} />
      </div>
      {err && <div className="error">{err}</div>}
      {q.isLoading ? (
        <SkeletonRows />
      ) : (
        <VirtualList
          items={q.data ?? []}
          rowHeight={70}
          render={(u) => (
            <div className="listrow">
              <div style={{ flex: 1 }}>
                <b>
                  {u.first_name} {u.last_name}
                </b>{" "}
                {!u.is_active && <span className="pill High">מושבת</span>}
                <div className="muted small num">{u.email}</div>
                <div className="muted small">כניסה אחרונה: {fmtDateTime(u.last_login)}</div>
              </div>
              <select value={u.role} onChange={(e) => upd.mutate({ id: u.user_id, body: { role: e.target.value as Role } })} style={{ width: 110 }}>
                {(Object.keys(ROLE_HE) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_HE[r]}
                  </option>
                ))}
              </select>
              <button className={u.is_active ? "danger" : "secondary"} onClick={() => upd.mutate({ id: u.user_id, body: { is_active: !u.is_active } })}>
                {u.is_active ? "השבתה" : "הפעלה"}
              </button>
            </div>
          )}
        />
      )}
    </div>
  );
}
