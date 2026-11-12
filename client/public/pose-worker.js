/* FitVision AI – pose worker (classic Web Worker, section 6.1.2).
 * Runs MediaPipe Pose Landmarker in VIDEO mode off the UI thread. Receives ImageBitmap frames and
 * returns only landmark arrays: no pixels ever leave this worker or the device (NFR-07).
 * A classic worker is used on purpose: MediaPipe loads its WASM glue with importScripts(), which module
 * workers (and therefore some Safari versions) do not support.
 */
/* global importScripts */
self.module = { exports: {} };
self.exports = self.module.exports;
importScripts("./mediapipe/vision_bundle.js");
const { FilesetResolver, PoseLandmarker } = self.module.exports;

let landmarker = null;
let busy = false;

async function create(model, delegate) {
  const fileset = await FilesetResolver.forVisionTasks(new URL("./mediapipe/wasm", self.location.href).href);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: new URL(`./models/pose_landmarker_${model}.task`, self.location.href).href, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

async function init(model) {
  if (landmarker) {
    landmarker.close();
    landmarker = null;
  }
  try {
    landmarker = await create(model, "GPU");
    self.postMessage({ type: "ready", model, delegate: "GPU" });
  } catch (gpuErr) {
    // no WebGL in workers on some devices: fall back to the CPU (XNNPACK) delegate
    landmarker = await create(model, "CPU");
    self.postMessage({ type: "ready", model, delegate: "CPU", note: String(gpuErr) });
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === "init") {
      await init(msg.model || "lite");
      return;
    }
    if (msg.type === "frame") {
      if (!landmarker || busy) {
        msg.bitmap.close();
        self.postMessage({ type: "skipped", timestamp: msg.timestamp });
        return;
      }
      busy = true;
      const t0 = performance.now();
      const res = landmarker.detectForVideo(msg.bitmap, msg.timestamp);
      msg.bitmap.close();
      busy = false;
      self.postMessage({
        type: "result",
        timestamp: msg.timestamp,
        inferenceMs: performance.now() - t0,
        landmarks: res.landmarks && res.landmarks[0] ? res.landmarks[0] : null,
        worldLandmarks: res.worldLandmarks && res.worldLandmarks[0] ? res.worldLandmarks[0] : null,
      });
    }
  } catch (err) {
    busy = false;
    self.postMessage({ type: "error", message: String(err && err.message ? err.message : err) });
  }
};
