// Self-hosts MediaPipe (6.3.2): copies the CommonJS bundle and the WASM files out of node_modules
// and downloads the BlazePose models once, so the app never loads them from third-party servers.
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "@mediapipe", "tasks-vision");
const out = join(root, "public", "mediapipe");
const models = join(root, "public", "models");
mkdirSync(out, { recursive: true });
mkdirSync(models, { recursive: true });

if (!existsSync(pkg)) {
  console.error("@mediapipe/tasks-vision is missing – run npm install first");
  process.exit(1);
}
const bundle = ["vision_bundle.cjs", "vision_bundle.js"].find((f) => existsSync(join(pkg, f)));
if (!bundle) {
  console.error("vision bundle not found in @mediapipe/tasks-vision");
  process.exit(1);
}
copyFileSync(join(pkg, bundle), join(out, "vision_bundle.cjs"));
cpSync(join(pkg, "wasm"), join(out, "wasm"), { recursive: true });

const MODELS = {
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  "pose_landmarker_full.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task",
};
for (const [name, url] of Object.entries(MODELS)) {
  const dest = join(models, name);
  if (existsSync(dest)) continue;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log("downloaded", name);
  } catch (err) {
    console.warn(`could not download ${name} (${err.message}). Place it manually in public/models/.`);
  }
}
console.log("MediaPipe assets ready in public/");
