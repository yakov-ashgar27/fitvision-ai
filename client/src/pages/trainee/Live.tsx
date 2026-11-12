/** Screen 3 – live workout: counter, skeleton, one correction at a time, readable from 2–3 metres. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coach, Cue } from "../../engine/coach";
import { CompletedRep, TechniqueEngine } from "../../engine/engine";
import { report } from "../../lib/rum";
import { cueLang, say, setSounds, setVoice, sfx, soundsOn, spokenLang, voiceOn, voicesReady } from "../../lib/speech";
import { addSet, finishWorkout } from "../../offline/sync";
import { drawSkeleton } from "../../vision/draw";
import { PosePipeline, PipelineStats, shutdownPose } from "../../vision/poseClient";
import { loadWorkout, saveWorkout } from "../../workout";

export default function Live() {
  const nav = useNavigate();
  const [w, setW] = useState(loadWorkout);
  const item = w?.items[w.index];
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TechniqueEngine | null>(null);
  const pipe = useRef<PosePipeline | null>(null);
  const reps = useRef<CompletedRep[]>([]);
  const setStart = useRef(new Date().toISOString());
  const shownMessages = useRef<string[]>([]);

  const [count, setCount] = useState(0);
  const [valid, setValid] = useState(0);
  const [feedback, setFeedback] = useState<(Cue & { id: number; joints: number[] }) | null>(null);
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  const [party, setParty] = useState(0);
  const coach = useRef<Coach | null>(null);
  const lang = useRef(cueLang());
  const [langNote, setLangNote] = useState<string | null>(null);
  const lastRule = useRef<number | null>(null);
  const cueId = useRef(0);
  const [tracking, setTracking] = useState(true);
  const [rest, setRest] = useState<number | null>(null);
  const [status, setStatus] = useState("מכין…");
  const [sounds, setS] = useState(soundsOn());
  const [voice, setV] = useState(voiceOn());
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const fbTimer = useRef<number>(0);

  useEffect(() => {
    if (!w || !item) nav("/", { replace: true });
  }, [w, item, nav]);

  const showCue = useCallback((cue: Cue | null, joints: number[] = []) => {
    if (!cue) return;
    cueId.current += 1;
    setFeedback({ ...cue, id: cueId.current, joints });
    // corrections, "finish the movement" cues and milestones are spoken; plain praise stays a visual + pop
    if (cue.key !== "praise" && cue.key !== "streak") say(cue.text, lang.current);
    if (cue.tone !== "good" && !shownMessages.current.includes(cue.text)) shownMessages.current.push(cue.text);
    window.clearTimeout(fbTimer.current);
    fbTimer.current = window.setTimeout(() => setFeedback(null), cue.tone === "good" ? 1600 : 2600);
  }, []);

  const endSet = useCallback(async () => {
    if (!w || !item || !engine.current) return;
    pipe.current?.pause();
    const done = reps.current;
    reps.current = [];
    if (done.length) {
      await addSet(w.localId, {
        exercise_id: item.exercise.exercise_id,
        started_at: setStart.current,
        ended_at: new Date().toISOString(),
        reps: done.map(({ score: _s, is_valid: _v, violated: _vi, ...r }) => r),
        scores: done.map((r) => r.score),
        valid: done.filter((r) => r.is_valid).length,
        messages: shownMessages.current.splice(0),
      });
    }
    const st = pipe.current?.stats();
    if (st) {
      report("pose_fps", st.fps);
      if (Number.isFinite(st.latencyP95)) report("feedback_latency_p95", st.latencyP95);
    }
    const next = { ...w, setsDone: w.setsDone + 1 };
    if (next.setsDone >= item.target_sets) {
      // exercise finished: next exercise needs its own camera setup, or the workout is over
      if (w.index + 1 < w.items.length) {
        saveWorkout({ ...next, index: w.index + 1, setsDone: 0 });
        nav("/workout/setup", { replace: true });
      } else {
        await finishWorkout(w.localId, "Done");
        saveWorkout(null);
        shutdownPose();
        nav(`/workout/summary/${w.localId}`, { replace: true });
      }
      return;
    }
    saveWorkout(next);
    setW(next);
    setRest(item.rest_seconds);
  }, [w, item, nav]);

  const endSetRef = useRef(endSet);
  endSetRef.current = endSet;

  // start camera + model once
  useEffect(() => {
    if (!item || !video.current) return;
    engine.current = new TechniqueEngine(item.exercise, { aspect: 4 / 3 });
    coach.current = new Coach(item.exercise.name, item.exercise.rules, item.target_reps, lang.current);
    const p = new PosePipeline(
      video.current,
      (r) => {
        const eng = engine.current!;
        const rep = eng.process({ image: r.image, world: r.world, t: r.t });
        const c = canvas.current;
        if (c && video.current) {
          if (c.width !== video.current.videoWidth && video.current.videoWidth) {
            c.width = video.current.videoWidth;
            c.height = video.current.videoHeight;
          }
          drawSkeleton(c, r.image, eng.state.feedback?.joints ?? []);
        }
        // a new correction during the rep: one cue per rule per rep, then it fades (no endless repetition)
        const fb = eng.state.feedback;
        if (fb && fb.ruleId !== lastRule.current) {
          lastRule.current = fb.ruleId;
          const cue = coach.current?.onViolation(fb.ruleId) ?? null;
          if (cue) showCue(cue, fb.joints);
        }
        setTracking(eng.state.tracking);
        if (rep) {
          lastRule.current = null;
          reps.current.push(rep);
          setCount(eng.state.reps);
          setValid(eng.state.validReps);
          const good = rep.is_valid && rep.violated.length === 0;
          setFlash(good ? "good" : "bad");
          window.setTimeout(() => setFlash(null), 450);
          const cue = coach.current?.onRep(rep, eng.state.reps) ?? null;
          if (eng.state.reps >= item.target_reps) {
            sfx.setDone();
            setParty((n) => n + 1);
          } else if (good) sfx.pop(); // a successful rep "pops"; a rep that needs fixing stays silent
          showCue(cue);
          if (eng.state.reps >= item.target_reps) void endSetRef.current();
        }
      },
      setStatus,
    );
    pipe.current = p;
    (async () => {
      try {
        await p.startCamera("user");
        await p.loadModel();
        setStatus("");
        setStart.current = new Date().toISOString();
        p.run();
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      }
    })();
    const t = window.setInterval(() => setStats(p.stats()), 1000);
    return () => {
      window.clearInterval(t);
      p.dispose();
    };
  }, [item, showCue]);

  // the phone may have no voice for the chosen language: speak (and show) the cues in one it has
  useEffect(() => {
    void voicesReady().then(() => {
      const l = spokenLang();
      if (l !== lang.current) {
        lang.current = l;
        if (item) coach.current = new Coach(item.exercise.name, item.exercise.rules, item.target_reps, l);
        setLangNote("לא נמצא קול עברי בטלפון, ולכן ההערות יוקראו באנגלית. אפשר להתקין קול עברי: הגדרות ← המרת טקסט לדיבור ← Google");
        window.setTimeout(() => setLangNote(null), 7000);
      }
    });
  }, [item]);

  // rest timer between sets
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      setRest(null);
      engine.current = item ? new TechniqueEngine(item.exercise, { aspect: 4 / 3 }) : null;
      coach.current = item ? new Coach(item.exercise.name, item.exercise.rules, item.target_reps, lang.current) : null;
      lastRule.current = null;
      setCount(0);
      setValid(0);
      setFeedback(null);
      setStart.current = new Date().toISOString();
      pipe.current?.run();
      say(lang.current === "en" ? "Go!" : "מתחילים", lang.current);
      return;
    }
    if (rest <= 3) sfx.tick();
    const t = window.setTimeout(() => setRest(rest - 1), 1000);
    return () => window.clearTimeout(t);
  }, [rest, item]);

  async function abort() {
    if (!w) return;
    if (!window.confirm("לסיים את האימון עכשיו?")) return;
    pipe.current?.pause();
    if (reps.current.length && item) {
      await addSet(w.localId, {
        exercise_id: item.exercise.exercise_id,
        started_at: setStart.current,
        ended_at: new Date().toISOString(),
        reps: reps.current.map(({ score: _s, is_valid: _v, violated: _vi, ...r }) => r),
        scores: reps.current.map((r) => r.score),
        valid: reps.current.filter((r) => r.is_valid).length,
        messages: shownMessages.current.splice(0),
      });
      reps.current = [];
    }
    const lastExercise = w.index === w.items.length - 1 && w.setsDone + 1 >= (item?.target_sets ?? 0);
    await finishWorkout(w.localId, lastExercise ? "Done" : "Aborted");
    saveWorkout(null);
    shutdownPose();
    nav(`/workout/summary/${w.localId}`, { replace: true });
  }

  if (!w || !item) return null;
  return (
    <div className="live">
      <div className={`stage ${flash ? `flash-${flash}` : ""}`} onDoubleClick={() => setShowStats(!showStats)}>
        <video ref={video} className="mirror" playsInline muted />
        <canvas ref={canvas} />
        <div className="hud">
          <div className="ring-wrap">
            <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="52" className="ring-bg" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="ring-fg"
                strokeDasharray={`${Math.min(1, count / item.target_reps) * 326.7} 326.7`}
              />
            </svg>
            <div className="ring-center">
              <div className="counter num" data-testid="rep-counter" aria-live="polite">
                {count}
              </div>
              <div className="small">מתוך {item.target_reps}</div>
            </div>
            <div className="valid-chip">✓ {valid} תקינות</div>
          </div>
          <div className="meta">
            <b>{item.exercise.name}</b>
            <div className="small">
              סט {w.setsDone + 1} מתוך {item.target_sets}
            </div>
            {showStats && stats && (
              <div className="dev" data-testid="stats">
                {stats.model}/{stats.delegate} · {stats.fps} fps · p95 {Number.isFinite(stats.latencyP95) ? Math.round(stats.latencyP95) : "–"}ms
              </div>
            )}
          </div>
        </div>
        {feedback && (
          <div key={feedback.id} className={`feedback tone-${feedback.tone}`} role="alert" data-testid="feedback">
            {feedback.text}
          </div>
        )}
        {(!tracking || status) && rest === null && (
          <div className="status" data-testid="live-status">
            {status || "האימון מושהה – חזרו למסגרת כך שכל הגוף נראה"}
          </div>
        )}
        {party > 0 && <Confetti key={party} />}
        {langNote && <div className="status small" style={{ top: "auto", bottom: 200 }}>{langNote}</div>}
        {rest !== null && (
          <div className="rest">
            <div>
              <div className="small">מנוחה</div>
              <div className="counter num">{rest}</div>
              <button className="secondary" onClick={() => setRest(0)} data-testid="skip-rest">
                דילוג
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="controls">
        <button
          className="secondary icon"
          aria-pressed={sounds}
          aria-label="צלילים"
          onClick={() => {
            setSounds(!sounds);
            setS(!sounds);
          }}
        >
          {sounds ? "🔔" : "🔕"}
        </button>
        <button
          className="secondary icon"
          aria-pressed={voice}
          aria-label="הקראה קולית"
          onClick={() => {
            setVoice(!voice);
            setV(!voice);
          }}
        >
          {voice ? "🗣️" : "🤐"}
        </button>
        <button className="secondary" onClick={() => void endSet()} disabled={rest !== null} data-testid="end-set">
          סיים סט
        </button>
        <button className="danger" onClick={abort} data-testid="end-workout">
          סיום אימון
        </button>
      </div>
    </div>
  );
}

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ec4899", "#a855f7", "#14b8a6"];
/** A short burst of confetti when a set is completed. */
function Confetti() {
  const bits = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 9) * 0.04,
    color: COLORS[i % COLORS.length],
    rot: (i * 47) % 360,
  }));
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, background: b.color, transform: `rotate(${b.rot}deg)` }} />
      ))}
    </div>
  );
}
