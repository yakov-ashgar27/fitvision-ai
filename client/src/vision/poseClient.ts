/**
 * Camera + pose estimation pipeline (section 6.1.2). Frames go to a classic Web Worker running MediaPipe;
 * only landmarks come back. At most one frame is in flight (back-pressure), and if the phone cannot keep
 * 15 FPS the model is switched from Full to Lite (R-01). Video never leaves the device (NFR-07).
 */
import type { Lm } from "../engine/geometry";

export interface PoseResult {
  image: Lm[] | null;
  world: Lm[] | null;
  t: number; // capture time (ms, performance clock)
  inferenceMs: number;
}

export interface PipelineStats {
  fps: number;
  latencyP50: number;
  latencyP95: number;
  model: "full" | "lite";
  delegate: string;
}

type TestFrame = { t: number; image: Lm[]; world: Lm[] };
declare global {
  interface Window {
    __FV_TEST_FRAMES__?: TestFrame[];
  }
}

const BASE = import.meta.env.BASE_URL ?? "/";
let shared: { worker: Worker; model: "full" | "lite"; delegate: string } | null = null;

/** Frees the model when the workout is over. */
export function shutdownPose(): void {
  shared?.worker.terminate();
  shared = null;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

export class PosePipeline {
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private inFlight = false;
  private stamps: number[] = [];
  private latencies: number[] = [];
  private startedAt = 0;
  private stopped = false;
  model: "full" | "lite";
  delegate = "?";
  ready = false;

  constructor(
    private video: HTMLVideoElement,
    private onResult: (r: PoseResult) => void,
    private onStatus: (msg: string) => void = () => {},
    initialModel: "full" | "lite" = "full",
  ) {
    this.model = initialModel;
  }

  /** Starts the camera. Rear camera by default: the phone stands 2–3 m away facing the trainee. */
  async startCamera(facingMode: "user" | "environment" = "user"): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
  }

  async loadModel(): Promise<void> {
    if (window.__FV_TEST_FRAMES__) {
      // end-to-end tests replay recorded landmarks instead of running the model
      this.ready = true;
      this.delegate = "replay";
      return;
    }
    if (this.worker) return;
    if (shared && shared.model === this.model) {
      // the worker and model stay loaded between the setup and live screens
      this.worker = shared.worker;
      this.delegate = shared.delegate;
      this.ready = true;
      this.worker.onmessage = (ev) => this.handle(ev.data);
      return;
    }
    shared?.worker.terminate();
    shared = null;
    this.worker = new Worker(`${BASE}pose-worker.js`);
    await new Promise<void>((resolve, reject) => {
      const w = this.worker!;
      const timer = setTimeout(() => reject(new Error("טעינת מודל הזיהוי נמשכה יותר מדי")), 60_000);
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.type === "ready") {
          clearTimeout(timer);
          this.ready = true;
          this.delegate = m.delegate;
          shared = { worker: w, model: this.model, delegate: m.delegate };
          this.onStatus(`מודל ${m.model === "full" ? "Full" : "Lite"} (${m.delegate}) מוכן`);
          w.onmessage = (ev) => this.handle(ev.data);
          resolve();
        } else if (m.type === "error") {
          clearTimeout(timer);
          reject(new Error(m.message));
        }
      };
      w.onerror = (e) => {
        clearTimeout(timer);
        reject(new Error(e.message || "worker error"));
      };
      w.postMessage({ type: "init", model: this.model });
    });
  }

  private handle(m: any) {
    if (m.type === "skipped") {
      this.inFlight = false;
      return;
    }
    if (m.type === "error") {
      this.inFlight = false;
      this.onStatus(`שגיאה: ${m.message}`);
      return;
    }
    if (m.type !== "result") return;
    this.inFlight = false;
    this.record(m.timestamp);
    this.onResult({ image: m.landmarks, world: m.worldLandmarks, t: m.timestamp, inferenceMs: m.inferenceMs });
    this.maybeFallBack();
  }

  private record(captureT: number) {
    const now = performance.now();
    this.stamps.push(now);
    this.latencies.push(now - captureT);
    while (this.stamps.length && now - this.stamps[0] > 1000) this.stamps.shift();
    if (this.latencies.length > 300) this.latencies.shift();
  }

  private maybeFallBack() {
    if (this.model === "full" && performance.now() - this.startedAt > 3000 && this.stamps.length < 15 && this.worker) {
      this.model = "lite";
      this.ready = false;
      this.onStatus("מעבר למודל Lite כדי לשמור על 15 FPS");
      this.worker.onmessage = (e) => {
        if (e.data.type === "ready") {
          this.ready = true;
          this.worker!.onmessage = (ev) => this.handle(ev.data);
          this.startedAt = performance.now();
        }
      };
      if (shared) shared.model = "lite";
      this.worker.postMessage({ type: "init", model: "lite" });
    }
  }

  stats(): PipelineStats {
    return {
      fps: this.stamps.length,
      latencyP50: percentile(this.latencies, 50),
      latencyP95: percentile(this.latencies, 95),
      model: this.model,
      delegate: this.delegate,
    };
  }

  run(): void {
    this.stopped = false;
    this.startedAt = performance.now();
    const replay = window.__FV_TEST_FRAMES__;
    const t0 = performance.now();
    let idx = 0;
    const loop = async () => {
      if (this.stopped) return;
      if (replay) {
        const elapsed = performance.now() - t0;
        while (idx < replay.length && replay[idx].t <= elapsed) {
          const f = replay[idx++];
          const cap = performance.now();
          this.record(cap);
          this.onResult({ image: f.image, world: f.world, t: cap, inferenceMs: 0 });
        }
      } else if (this.ready && !this.inFlight && this.worker && this.video.readyState >= 2) {
        this.inFlight = true;
        const ts = performance.now();
        try {
          const bitmap = await createImageBitmap(this.video);
          this.worker.postMessage({ type: "frame", bitmap, timestamp: ts }, [bitmap]);
        } catch {
          this.inFlight = false;
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.pause();
    if (this.worker && this.worker !== shared?.worker) this.worker.terminate();
    this.worker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
