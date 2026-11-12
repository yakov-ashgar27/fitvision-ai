import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { isMuted, setMuted } from "../lib/speech";

export default function Settings() {
  const { me, user, refresh, logout } = useAuth();
  const [params] = useSearchParams();
  const [muted, setM] = useState(isMuted());
  const [p, setP] = useState({ height_cm: "", weight_kg: "", fitness_level: "", injuries_notes: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = me?.trainee;
    if (t) setP({ height_cm: t.height_cm?.toString() ?? "", weight_kg: t.weight_kg?.toString() ?? "", fitness_level: t.fitness_level ?? "", injuries_notes: t.injuries_notes ?? "" });
  }, [me]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api("/me/profile", {
        method: "PUT",
        json: {
          trainee: {
            height_cm: p.height_cm ? Number(p.height_cm) : null,
            weight_kg: p.weight_kg ? Number(p.weight_kg) : null,
            fitness_level: p.fitness_level || null,
            injuries_notes: p.injuries_notes || null,
          },
        },
      });
      await refresh();
      setMsg("הפרופיל נשמר");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function deleteAccount() {
    if (!window.confirm("למחוק את החשבון ואת כל נתוני האימונים? לא ניתן לבטל.")) return;
    await api("/me", { method: "DELETE" });
    logout();
  }

  return (
    <div className="stack">
      <h1>{params.get("welcome") ? "ברוכים הבאים! נשלים את הפרופיל" : "הגדרות"}</h1>
      {user?.role === "Trainee" && (
        <form className="card stack" onSubmit={save}>
          <h3>פרופיל גופני</h3>
          <p className="muted small">הפרופיל גלוי רק למאמן המשויך אליכם.</p>
          <div className="grid2">
            <label>
              גובה (ס"מ)
              <input inputMode="decimal" value={p.height_cm} onChange={(e) => setP({ ...p, height_cm: e.target.value })} />
            </label>
            <label>
              משקל (ק"ג)
              <input inputMode="decimal" value={p.weight_kg} onChange={(e) => setP({ ...p, weight_kg: e.target.value })} />
            </label>
          </div>
          <label>
            רמת כושר
            <select value={p.fitness_level} onChange={(e) => setP({ ...p, fitness_level: e.target.value })}>
              <option value="">בחרו</option>
              <option value="Beginner">מתחיל</option>
              <option value="Intermediate">בינוני</option>
              <option value="Advanced">מתקדם</option>
            </select>
          </label>
          <label>
            פציעות עבר
            <textarea value={p.injuries_notes} onChange={(e) => setP({ ...p, injuries_notes: e.target.value })} />
          </label>
          {err && <div className="error">{err}</div>}
          {msg && <div className="ok">{msg}</div>}
          <button type="submit">שמירה</button>
        </form>
      )}
      {user?.role === "Trainer" && me?.trainer && (
        <div className="card">
          <h3>קוד ההזמנה שלכם</h3>
          <p className="muted small">מתאמנים מזינים את הקוד כדי לשלוח לכם בקשת שיוך.</p>
          <div className="num" style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: 4 }} data-testid="invite-code">
            {me.trainer.invite_code}
          </div>
        </div>
      )}
      <div className="card spread">
        <div>
          <h3>משוב קולי באימון</h3>
          <div className="muted small">ההודעות מוקראות בעברית</div>
        </div>
        <button className="secondary" onClick={() => { setMuted(!muted); setM(!muted); }}>
          {muted ? "מושתק – להפעיל" : "פעיל – להשתיק"}
        </button>
      </div>
      <div className="card stack">
        <h3>פרטיות</h3>
        <p className="small">
          הווידאו מעובד בטלפון בלבד ואינו נשלח לשרת. לשרת עוברים רק נתונים מספריים: מספר חזרות, זוויות ואירועי שגיאה.
          {user?.consent_at && <> הסכמתם לתנאים ב-{new Date(user.consent_at + "Z").toLocaleDateString("he-IL")}.</>}
        </p>
        {user?.role !== "Admin" && (
          <button className="danger" onClick={deleteAccount}>
            מחיקת החשבון וכל הנתונים
          </button>
        )}
      </div>
    </div>
  );
}
