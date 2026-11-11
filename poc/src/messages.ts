/** Messages exchanged between the UI thread and the pose worker. Only landmarks cross back — never pixels to a server. */
import type { Point3 } from "./geometry";

export type ModelVariant = "full" | "lite";

export type ToWorker =
  | { type: "init"; model: ModelVariant }
  | { type: "frame"; bitmap: ImageBitmap; timestamp: number };

export type FromWorker =
  | { type: "ready"; model: ModelVariant }
  | { type: "error"; message: string }
  | {
      type: "result";
      timestamp: number;
      inferenceMs: number;
      landmarks: Point3[] | null;
      worldLandmarks: Point3[] | null;
    };
