/** Screen 2 – workout setup: consent, camera placement for this exercise, and a body-visibility check. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { MIN_VISIBILITY } from "../../engine/geometry";
import { PosePipeline } from "../../vision/poseClient";
import { CAMERA_TIPS, loadWorkout } from "../../workout";

const KEY_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export default function Setup() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const w = loadWorkout();
  const video = useRef<HTMLVideoElement>(null);
  const pipe = useRef<PosePipeline | null>(null);
  const [consented, setConsented] = useState(!!user?.consent_at);
  const [stage, setStage] = useState<"consent" | "camera" | "ready">(user?.consent_at ? "camera" : "consent");
  const [status, setStatus] = useState("מפעיל מצלמה…");
  const [visibleFor, setVisibleFor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const item = w?.items[w.index];
  useEffect(() => {
    if (!w || !item) nav("/", { replace: true });
  }, [w, item, nav]);

  useEffect(() => {
    if (stage === "consent" || !video.current) return;
    let since = 0;
    const p = new PosePipeline(video.current, (r) => {
      // all key landmarks visible for one continuous second → ready (R-02)
      const ok = !!r.image && KEY_POINTS.every((i) => (r.image![i]?.visibility ?? 0) >= MIN_VISIBILITY);
      const now = performance.now();
      if (ok) {
        since = since || now;
        setVisibleFor(now - since);
      } else {
        since = 0;
        setVisibleFor(0);
      }
    }, setStatus);
    pipe.current = p;
    (async () => {
      try {
        await p.startCamera("user");
        setStatus("טוען את מודל הזיהוי…");
        await p.loadModel();
        setStatus("עמדו במקום כך שכל הגוף נראה");
        p.run();
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "לא ניתנה הרשאה למצלמה. אפשרו גישה למצלמה בהגדרות הדפדפן." : e?.message ?? String(e));
      }
    })();
    return () => p.dispose();
  }, [stage]);

  const ready = visibleFor >= 1000;
  useEffect(() => {
    if (ready && stage === "camera") setStage("ready");
  }, [ready, stage]);

  if (!w || !item) return null;
  const tips = CAMERA_TIPS[item.exercise.camera_view];

  if (stage === "consent")
    return (
      <div className="auth">
        <div className="card stack">
          <h1>לפני השימוש הראשון במצלמה</h1>
          <div className="privacy">
            הווידאו מעובד בטלפון בלבד. הוא אינו נשלח לשרת ואינו נשמר. לשרת עוברים רק נתונים מספריים: מספר חזרות, זוויות מפרקים ואירועי שגיאה.
          </div>
          <ul className="small">
            <li>הנתונים גלויים לכם ולמאמן המשויך אליכם בלבד.</li>
            <li>אפשר למחוק את החשבון ואת כל הנתונים בכל עת מתוך ההגדרות.</li>
          </ul>
          <label className="row" style={{ flexDirection: "row" }}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{ width: 24, minHeight: 24 }} data-testid="consent-box" />
            קראתי ואני מסכים/ה לעיבוד הנתונים כמתואר
          </label>
          <button
            disabled={!consented}
            data-testid="consent-ok"
            onClick={async () => {
              await api("/me/consent", { method: "POST" });
              await refresh();
              setStage("camera");
            }}
          >
            המשך
          </button>
        </div>
      </div>
    );

  return (
    <div className="live">
      <div className="stage">
        <video ref={video} className="mirror" playsInline muted />
        <div className="hud">
          <div className="meta">
            <b>{item.exercise.name}</b>
            <div className="small">
              {item.target_sets} סטים × {item.target_reps} · {tips.title}
            </div>
          </div>
        </div>
        <div className="status card" style={{ color: "var(--ink)" }}>
          <h3>{tips.title}</h3>
          <ul className="checks small" style={{ textAlign: "right" }}>
            {tips.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li className={ready ? "check-ok" : "check-wait"}>{ready ? "כל הגוף נראה – אפשר להתחיל" : status}</li>
          </ul>
          <div className="privacy small">הווידאו מעובד בטלפון בלבד ואינו נשלח לשרת</div>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
      <div className="controls">
        <button className="secondary" onClick={() => nav("/")}>
          ביטול
        </button>
        <button disabled={stage !== "ready"} data-testid="start-set" onClick={() => nav("/workout/live")}>
          התחל סט
        </button>
      </div>
    </div>
  );
}
