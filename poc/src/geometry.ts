/** Joint-angle math for the technique engine (section 4.6, step 1). */

export interface Point3 {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** Minimum landmark visibility for a point to be used (section 4.6). */
export const MIN_VISIBILITY = 0.5;

/** Angle at vertex B (degrees) between rays B→A and B→C. Uses z when present (world landmarks). */
export function jointAngle(a: Point3, b: Point3, c: Point3): number {
  const ba = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const bc = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const dot = ba[0] * bc[0] + ba[1] * bc[1] + ba[2] * bc[2];
  const norm = Math.hypot(...ba) * Math.hypot(...bc);
  if (norm === 0) return NaN;
  const cos = Math.min(1, Math.max(-1, dot / norm));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** True when every point is visible enough to be trusted. */
export function allVisible(points: Point3[], min = MIN_VISIBILITY): boolean {
  return points.every((p) => (p.visibility ?? 1) >= min);
}

/** Moving average over the last `size` values (5 frames in the spec). */
export class MovingAverage {
  private values: number[] = [];
  constructor(private readonly size = 5) {}

  push(v: number): number {
    this.values.push(v);
    if (this.values.length > this.size) this.values.shift();
    return this.values.reduce((s, x) => s + x, 0) / this.values.length;
  }

  reset(): void {
    this.values = [];
  }
}

/** BlazePose landmark indices used by the PoC. */
export const LM = {
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16,
  leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28,
} as const;
