/**
 * PoC UI thread: camera → ImageBitmap → worker → landmarks → knee angle → rep counter → canvas.
 * The skeleton is drawn on a plain <canvas>, outside any UI framework, so re-renders never block drawing.
 */
import { LM, MovingAverage, allVisible, jointAngle, type Point3 } from "./geometry";
import { RepCounter } from "./repCounter";
import type { FromWorker, ModelVariant } from "./messages";
import { Metrics } from "./metrics";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>("video");
const canvas = $<HTMLCanvasElement>("overlay");
const ctx = canvas.getContext("2d")!;

const worker = new Worker(new URL("./pose.worker.ts", import.meta.url));
const counter = new RepCounter();
const smooth = new MovingAverage(5);
const metrics = new Metrics();
let model: ModelVariant = "full";
let ready = false;
let inFlight = false; // back-pressure: at most one frame in the worker

const BONES: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder], [LM.leftShoulder, LM.leftHip], [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip], [LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle],
  [LM.leftShoulder, LM.leftElbow], [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow], [LM.rightElbow, LM.rightWrist],
];

function kneeAngle(world: Point3[], image: Point3[]): number {
  const sides = [
    [LM.leftHip, LM.leftKnee, LM.leftAnkle],
    [LM.rightHip, LM.rightKnee, LM.rightAnkle],
  ];
  // Front view: depth comes from the 3-D world landmarks; visibility comes from the image landmarks.
  const angles = sides
    .filter((idx) => allVisible(idx.map((i) => image[i])))
    .map(([a, b, c]) => jointAngle(world[a], world[b], world[c]));
  return angles.length ? angles.reduce((s, x) => s + x, 0) / angles.length : NaN;
}

function draw(points: Point3[] | null): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#22c55e";
  for (const [a, b] of BONES) {
    if (!allVisible([points[a], points[b]])) continue;
    ctx.beginPath();
    ctx.moveTo(points[a].x * canvas.width, points[a].y * canvas.height);
    ctx.lineTo(points[b].x * canvas.width, points[b].y * canvas.height);
    ctx.stroke();
  }
}

worker.onmessage = (e: MessageEvent<FromWorker>) => {
  const msg = e.data;
  if (msg.type === "ready") {
    ready = true;
    $("status").textContent = `מודל ${msg.model === "full" ? "BlazePose Full" : "BlazePose Lite"} נטען · הווידאו מעובד במכשיר בלבד`;
    return;
  }
  if (msg.type === "error") {
    $("status").textContent = `שגיאה: ${msg.message}`;
    inFlight = false;
    return;
  }
  inFlight = false;
  draw(msg.landmarks);
  if (msg.landmarks && msg.worldLandmarks) {
    const raw = kneeAngle(msg.worldLandmarks, msg.landmarks);
    if (Number.isFinite(raw)) {
      const angle = smooth.push(raw);
      $("angle").textContent = angle.toFixed(0);
      const ev = counter.update(angle);
      if (ev) {
        $("count").textContent = String(counter.reps);
        $("partial").textContent = String(counter.partials);
      }
    }
  }
  // End-to-end latency: from frame capture to the moment its result is drawn (NFR-01).
  metrics.record(performance.now() - msg.timestamp, msg.inferenceMs);
  $("metrics").textContent = metrics.summary(model);

  // R-01 mitigation: fall back from Full to Lite if the phone cannot sustain 15 FPS.
  if (model === "full" && metrics.shouldFallBack()) {
    model = "lite";
    ready = false;
    metrics.reset();
    worker.postMessage({ type: "init", model });
  }
};

async function start(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  worker.postMessage({ type: "init", model });
  requestAnimationFrame(loop);
}

async function loop(): Promise<void> {
  if (ready && !inFlight && video.readyState >= 2) {
    inFlight = true;
    const bitmap = await createImageBitmap(video);
    worker.postMessage({ type: "frame", bitmap, timestamp: performance.now() }, [bitmap]);
  }
  requestAnimationFrame(loop);
}

$<HTMLButtonElement>("start").onclick = () => {
  start().catch((err) => ($("status").textContent = `לא ניתן להפעיל מצלמה: ${err}`));
};
