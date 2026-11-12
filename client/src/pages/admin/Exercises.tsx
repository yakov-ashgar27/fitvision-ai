/** US-19 – exercises and TechniqueRules. A changed rule applies from the next workout, no code change (NFR-13). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../../api/client";
import type { Exercise, Rule } from "../../api/types";
import { SkeletonRows } from "../../components/Skeleton";

type RuleForm = Omit<Rule, "rule_id" | "exercise_id">;
const EMPTY: RuleForm = { rule_name: "", joint: "", landmark_a: 23, landmark_b: 25, landmark_c: 27, phase: "Bottom", min_angle: null, max_angle: 100, severity: "Med", error_message: "" };
const PHASE_HE: Record<string, string> = { Down: "ירידה", Bottom: "תחתית", Up: "עלייה", "": "כל השלבים" };

function RuleEditor({ initial, onSave, onCancel }: { initial: RuleForm; onSave: (r: RuleForm) => void; onCancel: () => void }) {
  const [r, setR] = useState<RuleForm>(initial);
  const num = (k: keyof RuleForm) => (e: any) => setR({ ...r, [k]: e.target.value === "" ? null : Number(e.target.value) });
  return (
    <form
      className="card stack"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSave(r);
      }}
    >
      <div className="grid2">
        <label>
          שם הכלל
          <input value={r.rule_name} onChange={(e) => setR({ ...r, rule_name: e.target.value })} required />
        </label>
        <label>
          מפרק
          <input value={r.joint} onChange={(e) => setR({ ...r, joint: e.target.value })} required />
        </label>
      </div>
      <div className="row">
        {(["landmark_a", "landmark_b", "landmark_c"] as const).map((k, i) => (
          <label key={k} style={{ width: 90 }}>
            {["נקודה A", "קודקוד B", "נקודה C"][i]}
            <input type="number" min={0} max={32} value={r[k]} onChange={num(k)} required />
          </label>
        ))}
        <label style={{ width: 120 }}>
          שלב
          <select value={r.phase ?? ""} onChange={(e) => setR({ ...r, phase: (e.target.value || null) as Rule["phase"] })}>
            {Object.entries(PHASE_HE).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label style={{ width: 90 }}>
          מינימום°
          <input type="number" min={0} max={180} value={r.min_angle ?? ""} onChange={num("min_angle")} />
        </label>
        <label style={{ width: 90 }}>
          מקסימום°
          <input type="number" min={0} max={180} value={r.max_angle ?? ""} onChange={num("max_angle")} />
        </label>
        <label style={{ width: 100 }}>
          חומרה
          <select value={r.severity} onChange={(e) => setR({ ...r, severity: e.target.value as Rule["severity"] })}>
            <option value="Low">נמוכה</option>
            <option value="Med">בינונית</option>
            <option value="High">גבוהה</option>
          </select>
        </label>
      </div>
      <label>
        הודעת תיקון
        <input value={r.error_message} onChange={(e) => setR({ ...r, error_message: e.target.value })} required />
      </label>
      <div className="row">
        <button type="submit">שמירה</button>
        <button type="button" className="secondary" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </form>
  );
}

export default function Exercises() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-exercises"], queryFn: () => api<Exercise[]>("/exercises?include_inactive=true") });
  const [editing, setEditing] = useState<{ exercise: number; rule?: Rule } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newEx, setNewEx] = useState({ name: "", camera_view: "Front" as "Front" | "Side", muscle_group: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-exercises"] });
  const save = useMutation({
    mutationFn: ({ exercise, rule, body }: { exercise: number; rule?: Rule; body: RuleForm }) =>
      rule ? api(`/rules/${rule.rule_id}`, { method: "PUT", json: body }) : api(`/exercises/${exercise}/rules`, { method: "POST", json: body }),
    onSuccess: () => {
      setEditing(null);
      void refresh();
    },
    onError: (e) => setErr((e as Error).message),
  });
  const del = useMutation({ mutationFn: (id: number) => api(`/rules/${id}`, { method: "DELETE" }), onSuccess: refresh, onError: (e) => setErr((e as Error).message) });
  const addEx = useMutation({
    mutationFn: () => api("/exercises", { method: "POST", json: { ...newEx, is_active: true } }),
    onSuccess: () => {
      setNewEx({ name: "", camera_view: "Front", muscle_group: "" });
      void refresh();
    },
    onError: (e) => setErr((e as Error).message),
  });

  if (q.isLoading) return <SkeletonRows />;
  return (
    <div className="stack">
      <h1>תרגילים וכללי טכניקה</h1>
      {err && <div className="error">{err}</div>}
      {q.data?.map((ex) => (
        <div className="card stack" key={ex.exercise_id}>
          <div className="spread">
            <h3>
              {ex.name} <span className="muted small">· {ex.camera_view === "Front" ? "מבט חזית" : "מבט צד"}</span>
            </h3>
            <button className="secondary" onClick={() => setEditing({ exercise: ex.exercise_id })}>
              + כלל
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>כלל</th>
                  <th>נקודות</th>
                  <th>שלב</th>
                  <th>טווח</th>
                  <th>חומרה</th>
                  <th>הודעה</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ex.rules.map((r) => (
                  <tr key={r.rule_id}>
                    <td>{r.rule_name}</td>
                    <td className="num">
                      {r.landmark_a}-{r.landmark_b}-{r.landmark_c}
                    </td>
                    <td>{PHASE_HE[r.phase ?? ""]}</td>
                    <td className="num">
                      {r.min_angle ?? "…"}–{r.max_angle ?? "…"}°
                    </td>
                    <td>
                      <span className={`pill ${r.severity}`}>{r.severity}</span>
                    </td>
                    <td>{r.error_message}</td>
                    <td>
                      <button className="link" onClick={() => setEditing({ exercise: ex.exercise_id, rule: r })}>
                        עריכה
                      </button>
                      <button className="link" onClick={() => window.confirm("למחוק את הכלל?") && del.mutate(r.rule_id)}>
                        מחיקה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {editing?.exercise === ex.exercise_id && (
            <RuleEditor
              initial={editing.rule ? { ...editing.rule } : EMPTY}
              onCancel={() => setEditing(null)}
              onSave={(body) => save.mutate({ exercise: ex.exercise_id, rule: editing.rule, body })}
            />
          )}
        </div>
      ))}
      <form
        className="card stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          addEx.mutate();
        }}
      >
        <h3>תרגיל חדש</h3>
        <div className="grid2">
          <label>
            שם
            <input value={newEx.name} onChange={(e) => setNewEx({ ...newEx, name: e.target.value })} required />
          </label>
          <label>
            קבוצת שרירים
            <input value={newEx.muscle_group} onChange={(e) => setNewEx({ ...newEx, muscle_group: e.target.value })} />
          </label>
        </div>
        <label>
          כיוון צילום
          <select value={newEx.camera_view} onChange={(e) => setNewEx({ ...newEx, camera_view: e.target.value as "Front" | "Side" })}>
            <option value="Front">חזית</option>
            <option value="Side">צד</option>
          </select>
        </label>
        <p className="muted small">אחרי השמירה, הוסיפו כלל בשלב "תחתית" עם זווית מקסימלית: זה המפרק שלפיו נספרות החזרות.</p>
        <button type="submit">הוספה</button>
      </form>
    </div>
  );
}
