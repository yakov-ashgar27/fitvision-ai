/**
 * Synthetic BlazePose landmarks for tests and the end-to-end "live workout" check.
 * A simple kinematic body: the counting joint follows a scripted angle curve, every other landmark is placed
 * plausibly and fully visible. Image coordinates are normalized 0..1, world coordinates are metres.
 */
import type { Lm } from "./geometry";

export type Kind = "squat" | "lunge" | "curl" | "press";
export interface RepScript {
  bottom: number; // deepest angle of the counting joint
  valgus?: boolean; // squat: knees cave in at the bottom
  elbowFlare?: boolean; // curl: elbow drifts forward
}

const L = 0.42; // limb segment length (m)

function base(): { img: Lm[]; world: Lm[] } {
  const img: Lm[] = [];
  const world: Lm[] = [];
  for (let i = 0; i < 33; i++) {
    img.push({ x: 0.5, y: 0.3, z: 0, visibility: 0.99 });
    world.push({ x: 0, y: -0.5, z: 0, visibility: 0.99 });
  }
  return { img, world };
}

function put(img: Lm[], world: Lm[], i: number, w: [number, number, number]) {
  world[i] = { x: w[0], y: w[1], z: w[2], visibility: 0.99 };
  // weak perspective projection: x right, y down, scale 0.32 per metre, centred
  img[i] = { x: 0.5 + w[0] * 0.32, y: 0.55 + w[1] * 0.32, z: w[2], visibility: 0.99 };
}

/** One frame of a body whose counting joint is at `theta` degrees. */
export function pose(kind: Kind, theta: number, script: RepScript = { bottom: 90 }, depthFrac = 0): { image: Lm[]; world: Lm[] } {
  const { img, world } = base();
  const r = (theta * Math.PI) / 180;
  const sideX = { l: -0.15, r: 0.15 };
  // "forward" lies along z (towards the lens) in a front view and along x (in the image plane) in a side view
  const sideView = kind === "lunge" || kind === "curl";
  const v = (lat: number, y: number, fwd: number): [number, number, number] => (sideView ? [fwd, y, lat * 0.1] : [lat, y, fwd]);
  if (kind === "squat" || kind === "lunge") {
    for (const [side, hip, knee, ankle] of [["l", 23, 25, 27], ["r", 24, 26, 28]] as const) {
      const x = sideX[side];
      // valgus: the knees cave in towards the midline, inside the ankles
      const kneeLat = kind === "squat" && script.valgus ? x * (1 - 0.8 * depthFrac) : x;
      put(img, world, ankle, v(x, 0.85, 0));
      put(img, world, knee, v(kneeLat, 0.85 - L, 0));
      // thigh at angle theta from the vertical shin
      put(img, world, hip, v(kneeLat, 0.85 - L + L * Math.cos(r), -L * Math.sin(r)));
    }
    const hipY = (world[23].y + world[24].y) / 2;
    const hipF = sideView ? world[23].x : (world[23].z ?? 0);
    put(img, world, 11, v(-0.18, hipY - 0.5, hipF));
    put(img, world, 12, v(0.18, hipY - 0.5, hipF));
    put(img, world, 13, v(-0.22, hipY - 0.25, hipF));
    put(img, world, 14, v(0.22, hipY - 0.25, hipF));
    put(img, world, 15, v(-0.22, hipY - 0.05, hipF));
    put(img, world, 16, v(0.22, hipY - 0.05, hipF));
    put(img, world, 0, v(0, hipY - 0.75, hipF));
  } else {
    for (const [side, sh, el, wr, hip] of [["l", 11, 13, 15, 23], ["r", 12, 14, 16, 24]] as const) {
      const x = sideX[side];
      const s = side === "l" ? -1 : 1;
      put(img, world, sh, v(x, -0.5, 0));
      put(img, world, hip, v(x, 0, 0));
      put(img, world, 25 + (side === "l" ? 0 : 1), v(x, 0.42, 0));
      put(img, world, 27 + (side === "l" ? 0 : 1), v(x, 0.84, 0));
      if (kind === "curl") {
        // upper arm hangs down (drifting forward by `flare`), forearm at angle theta from it, rising forward
        const flare = script.elbowFlare ? 0.6 * depthFrac : 0.02;
        const el2: [number, number] = [L * Math.sin(flare), -0.5 + L * Math.cos(flare)]; // (fwd, y)
        const ux = -Math.sin(flare), uy = -Math.cos(flare); // elbow → shoulder
        const fx = ux * Math.cos(r) - uy * Math.sin(r);
        const fy = ux * Math.sin(r) + uy * Math.cos(r);
        put(img, world, el, v(x, el2[1], el2[0]));
        put(img, world, wr, v(x, el2[1] + L * fy, el2[0] + L * fx));
      } else {
        // press, front view: shoulder abduction theta between upper arm and torso, forearm vertical
        const ex = x + s * L * Math.sin(r), ey = -0.5 - L * Math.cos(Math.PI - r);
        put(img, world, el, v(ex, ey, 0));
        put(img, world, wr, v(ex, ey - L, 0));
      }
    }
    put(img, world, 0, v(0, -0.75, 0));
  }
  if (sideView) for (const i of [12, 14, 16, 24, 26, 28]) img[i].visibility = 0.35; // far side partly hidden
  return { image: img, world };
}

/** Angle curve for a list of reps at `fps`, starting and ending at rest. */
export function script(kind: Kind, reps: RepScript[], fps = 30, repSeconds = 2.4, rest = 170): { t: number; image: Lm[]; world: Lm[] }[] {
  const frames: { t: number; image: Lm[]; world: Lm[] }[] = [];
  let t = 0;
  const dt = 1000 / fps;
  const hold = (theta: number, n: number) => {
    for (let i = 0; i < n; i++, t += dt) frames.push({ t, ...pose(kind, theta) });
  };
  hold(rest, fps); // 1 s standing
  for (const rep of reps) {
    const n = Math.round(repSeconds * fps);
    for (let i = 0; i < n; i++, t += dt) {
      const phase = i / (n - 1); // 0 → 1 → 0 via cosine
      const frac = (1 - Math.cos(2 * Math.PI * phase)) / 2;
      const theta = rest - (rest - rep.bottom) * frac;
      frames.push({ t, ...pose(kind, theta, rep, frac) });
    }
    hold(rest, Math.round(fps * 0.4));
  }
  return frames;
}
