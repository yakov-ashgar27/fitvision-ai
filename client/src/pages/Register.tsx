import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Register() {
  const { register, user } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", password: "", role: "Trainee" as "Trainee" | "Trainer" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.password.length < 8) return setError("הסיסמה צריכה להכיל 8 תווים לפחות");
    setBusy(true);
    setError(null);
    try {
      const u = await register({ ...f, email: f.email.trim() });
      nav(u.role === "Trainee" ? "/settings?welcome=1" : "/trainer", { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <h1>הרשמה ל-FitVision AI</h1>
        <div className="row">
          <label style={{ flex: 1 }}>
            <span>
              <input type="radio" name="role" value="Trainee" checked={f.role === "Trainee"} onChange={set("role")} style={{ width: "auto", minHeight: 0 }} /> מתאמן
            </span>
          </label>
          <label style={{ flex: 1 }}>
            <span>
              <input type="radio" name="role" value="Trainer" checked={f.role === "Trainer"} onChange={set("role")} style={{ width: "auto", minHeight: 0 }} /> מאמן כושר
            </span>
          </label>
        </div>
        <div className="grid2">
          <label>
            שם פרטי
            <input value={f.first_name} onChange={set("first_name")} required />
          </label>
          <label>
            שם משפחה
            <input value={f.last_name} onChange={set("last_name")} required />
          </label>
        </div>
        <label>
          דוא"ל
          <input type="email" value={f.email} onChange={set("email")} required dir="ltr" autoComplete="email" />
        </label>
        <label>
          סיסמה (8 תווים לפחות)
          <input type="password" value={f.password} onChange={set("password")} required dir="ltr" autoComplete="new-password" />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "נרשם…" : "יצירת חשבון"}
        </button>
        <p className="muted small">
          כבר רשומים? <Link to="/login">התחברות</Link>
        </p>
      </form>
    </div>
  );
}
