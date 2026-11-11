/// <reference lib="webworker" />
/**
 * Runs MediaPipe Pose Landmarker off the UI thread (VIDEO mode, detectForVideo).
 * Receives ImageBitmap frames, returns 33 image landmarks + 33 world landmarks (metres).
 */
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { FromWorker, ModelVariant, ToWorker } from "./messages";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL: Record<ModelVariant, string> = {
  full: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
  lite: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
};

let landmarker: PoseLandmarker | null = null;
const post = (msg: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

async function init(model: ModelVariant): Promise<void> {
  landmarker?.close();
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL[model], delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  post({ type: "ready", model });
}

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      await init(msg.model);
      return;
    }
    if (!landmarker) {
      msg.bitmap.close();
      return;
    }
    const t0 = performance.now();
    const res = landmarker.detectForVideo(msg.bitmap, msg.timestamp);
    msg.bitmap.close();
    post({
      type: "result",
      timestamp: msg.timestamp,
      inferenceMs: performance.now() - t0,
      landmarks: res.landmarks[0] ?? null,
      worldLandmarks: res.worldLandmarks[0] ?? null,
    });
  } catch (err) {
    post({ type: "error", message: String(err) });
  }
};
