import { describe, expect, it } from "vitest";
import { RepCounter } from "./repCounter";
import { MovingAverage, jointAngle } from "./geometry";
import { percentile } from "./metrics";

const feed = (c: RepCounter, angles: number[]) => angles.map((a) => c.update(a)).filter(Boolean);

describe("jointAngle", () => {
  it("returns 90° for perpendicular rays", () => {
    expect(jointAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90);
  });
  it("returns 180° for a straight limb, using z", () => {
    expect(jointAngle({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 })).toBeCloseTo(180);
  });
});

describe("MovingAverage", () => {
  it("averages the last 5 values", () => {
    const m = new MovingAverage(5);
    [10, 20, 30, 40, 50].forEach((v) => m.push(v));
    expect(m.push(60)).toBe(40); // (20+30+40+50+60)/5
  });
});

describe("RepCounter (figure 4.5)", () => {
  it("counts a full squat only on Up → Standing", () => {
    const c = new RepCounter();
    const events = feed(c, [170, 145, 120, 95, 90, 92, 105, 140, 158]);
    expect(events).toHaveLength(0);
    expect(c.phase).toBe("Up");
    const done = feed(c, [165]);
    expect(done).toEqual([{ kind: "rep", minAngle: 90 }]);
    expect(c.reps).toBe(1);
  });

  it("records a partial rep when returning above 160° without reaching depth", () => {
    const c = new RepCounter();
    feed(c, [170, 140, 120, 115, 130, 165]);
    expect(c.reps).toBe(0);
    expect(c.partials).toBe(1);
  });

  it("ignores jitter between 150° and 160° (hysteresis)", () => {
    const c = new RepCounter();
    feed(c, [170, 149, 155, 149, 155, 158]);
    expect(c.reps + c.partials).toBe(0);
    expect(c.phase).toBe("Down");
  });

  it("counts three consecutive reps", () => {
    const c = new RepCounter();
    for (let i = 0; i < 3; i++) feed(c, [170, 140, 98, 95, 110, 150, 165]);
    expect(c.reps).toBe(3);
  });
});

describe("percentile", () => {
  it("computes p50 and p95", () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
  });
});
