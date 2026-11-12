import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      nav("/", { replace: true });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="card stack" onSubmit={submit}>
        <h1>
          FitVision <span style={{ color: "var(--accent)" }}>AI</span>
        </h1>
        <p className="muted">התחברות</p>
        <label>
          דוא"ל
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
        </label>
        <label>
          סיסמה
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" />
        </label>
        {error && <div className="error" role="alert">{error}</div>}
        <button type="submit" disabled={busy}>
          {busy ? "מתחבר…" : "כניסה"}
        </button>
        <p className="muted small">
          אין לכם חשבון? <Link to="/register">הרשמה</Link>
        </p>
      </form>
    </div>
  );
}
