import { defineConfig } from "vite";

// getUserMedia requires a secure context: on a phone, open the dev server over HTTPS
// (e.g. via a tunnel) or use Chrome's "Insecure origins treated as secure" flag for testing.
export default defineConfig({
  worker: { format: "iife" }, // classic worker: MediaPipe's WASM loader uses importScripts()
  optimizeDeps: { exclude: ["@mediapipe/tasks-vision"] },
});
