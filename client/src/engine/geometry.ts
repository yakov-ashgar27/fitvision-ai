/** Joint-angle math (section 4.6, step 1). */
export interface Lm {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export const MIN_VISIBILITY = 0.5;

/** BlazePose left/right landmark pairs, used to mirror a rule defined on the left side. */
const PAIRS: [number, number][] = [
  [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32], [1, 4], [2, 5], [3, 6], [7, 8], [9, 10],
];
const MIRROR = new Map<number, number>();
for (const [l, r] of PAIRS) {
  MIRROR.set(l, r);
  MIRROR.set(r, l);
}
export const mirror = (i: number) => MIRROR.get(i) ?? i;
export const isLeft = (i: number) => PAIRS.some(([l]) => l === i);

/** Angle at b (degrees) between b→a and b→c. aspect scales x for normalized image coordinates. */
export function angle(a: Lm, b: Lm, c: Lm, use3d: boolean, aspect = 1): number {
  const ax = (a.x - b.x) * aspect, ay = a.y - b.y, az = use3d ? (a.z ?? 0) - (b.z ?? 0) : 0;
  const cx = (c.x - b.x) * aspect, cy = c.y - b.y, cz = use3d ? (c.z ?? 0) - (b.z ?? 0) : 0;
  const dot = ax * cx + ay * cy + az * cz;
  const n = Math.hypot(ax, ay, az) * Math.hypot(cx, cy, cz);
  if (!n) return NaN;
  return (Math.acos(Math.min(1, Math.max(-1, dot / n))) * 180) / Math.PI;
}

export function visible(pts: (Lm | undefined)[], min = MIN_VISIBILITY): boolean {
  return pts.every((p) => p !== undefined && (p.visibility ?? 1) >= min);
}

export function meanVisibility(pts: (Lm | undefined)[]): number {
  return pts.reduce((s, p) => s + (p?.visibility ?? 0), 0) / pts.length;
}

export class MovingAverage {
  private v: number[] = [];
  constructor(private size = 5) {}
  push(x: number): number {
    this.v.push(x);
    if (this.v.length > this.size) this.v.shift();
    return this.v.reduce((s, y) => s + y, 0) / this.v.length;
  }
  reset() {
    this.v = [];
  }
}
