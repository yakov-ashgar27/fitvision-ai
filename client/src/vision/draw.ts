/** Skeleton overlay on a plain canvas, outside React, so re-renders never delay drawing (6.1.2). */
import type { Lm } from "../engine/geometry";
import { MIN_VISIBILITY } from "../engine/geometry";

const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
];

export function drawSkeleton(canvas: HTMLCanvasElement, pts: Lm[] | null, bad: number[] = [], mirrored = true): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!pts) return;
  const X = (p: Lm) => (mirrored ? 1 - p.x : p.x) * w;
  const Y = (p: Lm) => p.y * h;
  const badSet = new Set(bad);
  ctx.lineCap = "round";
  for (const [a, b] of BONES) {
    const pa = pts[a], pb = pts[b];
    if (!pa || !pb || (pa.visibility ?? 1) < MIN_VISIBILITY || (pb.visibility ?? 1) < MIN_VISIBILITY) continue;
    ctx.strokeStyle = badSet.has(a) && badSet.has(b) ? "#ef4444" : "#22c55e";
    ctx.lineWidth = Math.max(3, w / 120);
    ctx.beginPath();
    ctx.moveTo(X(pa), Y(pa));
    ctx.lineTo(X(pb), Y(pb));
    ctx.stroke();
  }
  for (const i of badSet) {
    const p = pts[i];
    if (!p) continue;
    ctx.fillStyle = "#ef4444"; // the faulty joint is marked in red (US-06)
    ctx.beginPath();
    ctx.arc(X(p), Y(p), Math.max(8, w / 50), 0, Math.PI * 2);
    ctx.fill();
  }
}
