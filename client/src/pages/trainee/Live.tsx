/** Screen 3 – live workout: counter, skeleton, one correction at a time, readable from 2–3 metres. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CompletedRep, Feedback, TechniqueEngine } from "../../engine/engine";
import { report } from "../../lib/rum";
import { beep, isMuted, say, setMuted } from "../../lib/speech";
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
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tracking, setTracking] = useState(true);
  const [rest, setRest] = useState<number | null>(null);
  const [status, setStatus] = useState("מכין…");
  const [muted, setM] = useState(isMuted());
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const fbTimer = useRef<number>(0);

  useEffect(() => {
    if (!w || !item) nav("/", { replace: true });
  }, [w, item, nav]);

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
        const fb = eng.state.feedback;
        if (fb) {
          setFeedback((prev) => {
            if (prev?.ruleId !== fb.ruleId) {
              say(fb.message);
              if (!shownMessages.current.includes(fb.message)) shownMessages.current.push(fb.message);
            }
            return fb;
          });
          window.clearTimeout(fbTimer.current);
          fbTimer.current = window.setTimeout(() => setFeedback(null), 2500);
        }
        setTracking(eng.state.tracking);
        if (rep) {
          reps.current.push(rep);
          setCount(eng.state.reps);
          setValid(eng.state.validReps);
          beep();
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
  }, [item]);

  // rest timer between sets
  useEffect(() => {
    if (rest === null) return;
    if (rest <= 0) {
      setRest(null);
      engine.current = item ? new TechniqueEngine(item.exercise, { aspect: 4 / 3 }) : null;
      setCount(0);
      setValid(0);
      setFeedback(null);
      setStart.current = new Date().toISOString();
      pipe.current?.run();
      say("מתחילים");
      return;
    }
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
      <div className="stage" onDoubleClick={() => setShowStats(!showStats)}>
        <video ref={video} className="mirror" playsInline muted />
        <canvas ref={canvas} />
        <div className="hud">
          <div>
            <div className="counter num" data-testid="rep-counter" aria-live="polite">
              {count}
            </div>
            <div className="small">מתוך {item.target_reps} · תקינות {valid}</div>
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
          <div className={`feedback ${feedback.severity}`} role="alert" data-testid="feedback">
            {feedback.message}
          </div>
        )}
        {(!tracking || status) && rest === null && (
          <div className="status" data-testid="live-status">
            {status || "האימון מושהה – חזרו למסגרת כך שכל הגוף נראה"}
          </div>
        )}
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
        <button className="secondary" onClick={() => { setMuted(!muted); setM(!muted); }} aria-label="השתקת משוב קולי">
          {muted ? "🔇" : "🔊"}
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
