import { ReactNode, useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useOnline } from "../lib/hooks";
import { onChange, pendingCount } from "../offline/sync";
import InstallApp from "./InstallApp";

const NAV: Record<string, [string, string][]> = {
  Trainee: [["/", "בית"], ["/history", "היסטוריה"], ["/reports", "דוחות"], ["/settings", "הגדרות"]],
  Trainer: [["/trainer", "דשבורד"], ["/settings", "הגדרות"]],
  Admin: [["/admin/users", "משתמשים"], ["/admin/exercises", "תרגילים"], ["/admin/audit", "יומן"], ["/settings", "הגדרות"]],
};

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const online = useOnline();
  const nav = useNavigate();
  const [pending, setPending] = useState(0);
  useEffect(() => {
    void pendingCount().then(setPending);
    return onChange(() => void pendingCount().then(setPending));
  }, []);
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          FitVision <b>AI</b>
        </Link>
        <nav className="nav">
          {(NAV[user?.role ?? ""] ?? []).map(([to, label]) => (
            <NavLink key={to} to={to} end>
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          className="link"
          onClick={() => {
            logout();
            nav("/login");
          }}
        >
          יציאה
        </button>
      </header>
      {!online && <div className="banner warn">אין חיבור לרשת · אימונים נשמרים במכשיר ויסונכרנו אוטומטית</div>}
      {online && pending > 0 && <div className="banner">מסנכרן {pending} אימונים שנשמרו במכשיר…</div>}
      <main className="main">
        <InstallApp />
        {children}
      </main>
    </div>
  );
}
