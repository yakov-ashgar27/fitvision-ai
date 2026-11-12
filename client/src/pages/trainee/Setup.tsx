/** Screen 2 – workout setup: consent, camera placement for this exercise, and a body-visibility check. */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { MIN_VISIBILITY } from "../../engine/geometry";
import type { Lm } from "../../engine/geometry";
import { drawSkeleton } from "../../vision/draw";
import { PosePipeline } from "../../vision/poseClient";
import { discardIfEmpty } from "../../offline/sync";
import { CAMERA_TIPS, loadWorkout, saveWorkout } from "../../workout";

/** Body parts that must be in frame. Front view needs both sides; side view needs the side facing the camera. */
const PARTS: { name: string; left: number[]; right: number[] }[] = [
  { name: "ראש", left: [0], right: [0] },
  { name: "כתפיים", left: [11], right: [12] },
  { name: "ידיים", left: [13, 15], right: [14, 16] },
  { name: "אגן", left: [23], right: [24] },
  { name: "ברכיים", left: [25], right: [26] },
  { name: "קרסוליים", left: [27], right: [28] },
];

const seen = (pts: Lm[], ids: number[]) => ids.every((i) => (pts[i]?.visibility ?? 0) >= MIN_VISIBILITY);

/** Names of the body parts that are not visible; empty when the whole body is in frame. */
export function missingParts(pts: Lm[] | null | undefined, view: "Front" | "Side"): string[] {
  if (!pts) return PARTS.map((p) => p.name);
  if (view === "Front") return PARTS.filter((p) => !seen(pts, [...p.left, ...p.right])).map((p) => p.name);
  const missLeft = PARTS.filter((p) => !seen(pts, p.left)).map((p) => p.name);
  const missRight = PARTS.filter((p) => !seen(pts, p.right)).map((p) => p.name);
  return missLeft.length <= missRight.length ? missLeft : missRight;
}

function hint(missing: string[]): string {
  if (missing.length === PARTS.length) return "לא מזהים אדם בתמונה. עמדו מול המצלמה, 2–3 מטר ממנה";
  const low = missing.some((m) => m === "ברכיים" || m === "קרסוליים");
  const high = missing.some((m) => m === "ראש" || m === "כתפיים");
  if (low && high) return `לא רואים: ${missing.join(", ")}. התרחקו מהטלפון`;
  if (low) return `לא רואים: ${missing.join(", ")}. התרחקו, או הנמיכו את הטלפון`;
  if (high) return `לא רואים: ${missing.join(", ")}. התרחקו, או הגביהו את הטלפון`;
  return `לא רואים: ${missing.join(", ")}. ודאו שהידיים בתוך התמונה`;
}

export default function Setup() {
  // the gym may have no signal: fetch the live and summary screens now, so the workout never waits on the network
  useEffect(() => {
    void import("./Live");
    void import("./Summary");
  }, []);
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const w = loadWorkout();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const pipe = useRef<PosePipeline | null>(null);
  const [consented, setConsented] = useState(!!user?.consent_at);
  const [stage, setStage] = useState<"consent" | "camera" | "ready">(user?.consent_at ? "camera" : "consent");
  const [status, setStatus] = useState("מפעיל מצלמה…");
  const [visibleFor, setVisibleFor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const item = w?.items[w.index];
  const view: "Front" | "Side" = item?.exercise.camera_view ?? "Front";
  useEffect(() => {
    if (!w || !item) nav("/", { replace: true });
  }, [w, item, nav]);

  useEffect(() => {
    if (stage === "consent" || !video.current) return;
    let since = 0;
    let last = "";
    const p = new PosePipeline(video.current, (r) => {
      const c = canvas.current;
      if (c && video.current?.videoWidth) {
        c.width = video.current.videoWidth;
        c.height = video.current.videoHeight;
        drawSkeleton(c, r.image ?? null);
      }
      // the needed body parts visible for one continuous second → ready (R-02)
      const miss = missingParts(r.image, view);
      const key = miss.join(",");
      if (key !== last) {
        last = key;
        setMissing(miss);
      }
      const t = performance.now();
      if (miss.length === 0) {
        since = since || t;
        setVisibleFor(t - since);
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
        setLoadedAt(Date.now());
        p.run();
      } catch (e: any) {
        setError(e?.name === "NotAllowedError" ? "לא ניתנה הרשאה למצלמה. אפשרו גישה למצלמה בהגדרות הדפדפן." : e?.message ?? String(e));
      }
    })();
    return () => p.dispose();
  }, [stage, view]);

  const ready = visibleFor >= 1000;
  // after a while, let the user start anyway (the live screen pauses counting while the body is out of frame)
  useEffect(() => {
    if (!loadedAt || ready) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [loadedAt, ready]);
  const canForce = !!loadedAt && !ready && now - loadedAt > 8000;
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

  const line = error
    ? error
    : ready
      ? "כל הגוף נראה – אפשר להתחיל"
      : loadedAt && missing
        ? hint(missing)
        : status;

  return (
    <div className="live">
      <div className="stage">
        <video ref={video} className="mirror" playsInline muted />
        <canvas ref={canvas} />
        <div className="hud">
          <div className="meta">
            <b>{item.exercise.name}</b>
            <div className="small">
              {item.target_sets} סטים × {item.target_reps} · {tips.title}
            </div>
          </div>
        </div>
      </div>
      <div className="setup-panel">
        <div className={`setup-status ${ready ? "ok" : error ? "bad" : "wait"}`} data-testid="setup-status" role="status">
          {ready ? "✓ " : ""}
          {line}
        </div>
        <details className="setup-tips" open={!loadedAt}>
          <summary>איך להציב את הטלפון ({tips.title})</summary>
          <ol>
            {tips.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </details>
        <div className="setup-privacy">הווידאו מעובד בטלפון בלבד ואינו נשלח לשרת</div>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button
            className="secondary"
            style={{ flex: 1 }}
            onClick={async () => {
              if (w.index === 0 && w.setsDone === 0) {
                await discardIfEmpty(w.localId);
                saveWorkout(null);
              }
              nav("/");
            }}
          >
            ביטול
          </button>
          {canForce ? (
            <button style={{ flex: 2 }} className="secondary" data-testid="start-anyway" onClick={() => nav("/workout/live")}>
              להתחיל בכל זאת
            </button>
          ) : (
            <button style={{ flex: 2 }} disabled={stage !== "ready"} data-testid="start-set" onClick={() => nav("/workout/live")}>
              התחל סט
            </button>
          )}
        </div>
        {canForce && <div className="setup-note">הספירה תעבוד רק כשכל הגוף בתמונה. אם חלק חסר, האימון יושהה עד שתחזרו למסגרת.</div>}
      </div>
    </div>
  );
}
