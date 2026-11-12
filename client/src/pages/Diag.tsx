/** Device check (table ג.2): runs the real camera + MediaPipe pipeline and shows FPS and latency. */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { drawSkeleton } from "../vision/draw";
import { PipelineStats, PosePipeline } from "../vision/poseClient";

export default function Diag() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [model, setModel] = useState<"full" | "lite">("lite");
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [landmarks, setLandmarks] = useState(0);
  const [status, setStatus] = useState("מפעיל מצלמה…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!video.current) return;
    const p = new PosePipeline(
      video.current,
      (r) => {
        setLandmarks(r.image?.length ?? 0);
        const c = canvas.current;
        if (c && video.current?.videoWidth) {
          c.width = video.current.videoWidth;
          c.height = video.current.videoHeight;
          drawSkeleton(c, r.image);
        }
      },
      setStatus,
      model,
    );
    (async () => {
      try {
        await p.startCamera("user");
        setStatus("טוען מודל…");
        await p.loadModel();
        p.run();
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
    const t = setInterval(() => setStats(p.stats()), 1000);
    return () => {
      clearInterval(t);
      p.dispose();
    };
  }, [model]);

  return (
    <div className="live">
      <div className="stage">
        <video ref={video} className="mirror" playsInline muted />
        <canvas ref={canvas} />
        <div className="hud">
          <div className="meta" data-testid="diag" style={{ direction: "ltr" }}>
            <div>model: {stats?.model ?? model} / {stats?.delegate ?? "?"}</div>
            <div>
              FPS: <b data-testid="diag-fps">{stats?.fps ?? 0}</b>
            </div>
            <div>
              latency p50/p95: <b data-testid="diag-p50">{stats && Number.isFinite(stats.latencyP50) ? Math.round(stats.latencyP50) : "–"}</b> /{" "}
              <b data-testid="diag-p95">{stats && Number.isFinite(stats.latencyP95) ? Math.round(stats.latencyP95) : "–"}</b> ms
            </div>
            <div>
              landmarks: <b data-testid="diag-landmarks">{landmarks}</b>
            </div>
            <div className="small">{error ?? status}</div>
          </div>
        </div>
      </div>
      <div className="controls">
        <button className="secondary" onClick={() => setModel(model === "full" ? "lite" : "full")}>
          {model === "full" ? "מעבר ל-Lite" : "מעבר ל-Full"}
        </button>
        <Link className="btn secondary" to="/">
          חזרה
        </Link>
      </div>
    </div>
  );
}
