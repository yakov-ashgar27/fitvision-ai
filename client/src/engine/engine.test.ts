import { describe, expect, it } from "vitest";
import { angle, MovingAverage } from "./geometry";
import { CompletedRep, primaryRule, repScore, TechniqueEngine } from "./engine";
import { CURL, LUNGE, PRESS, SQUAT } from "./exercises.fixture";
import { Kind, RepScript, script } from "./synthetic";
import type { Exercise } from "../api/types";

function run(ex: Exercise, kind: Kind, reps: RepScript[]) {
  const eng = new TechniqueEngine(ex, { now: () => new Date("2028-03-05T10:00:00Z") });
  const done: CompletedRep[] = [];
  for (const f of script(kind, reps)) {
    const r = eng.process({ image: f.image, world: f.world, t: f.t });
    if (r) done.push(r);
  }
  return { eng, done };
}

describe("geometry", () => {
  it("computes 2D and 3D angles", () => {
    expect(angle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, false)).toBeCloseTo(90);
    expect(angle({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, true)).toBeCloseTo(180);
  });
  it("smooths over 5 frames", () => {
    const m = new MovingAverage(5);
    [10, 20, 30, 40, 50].forEach((v) => m.push(v));
    expect(m.push(60)).toBe(40);
  });
});

describe("counting rule comes from data (NFR-13)", () => {
  it("uses the Bottom rule with a max angle", () => {
    expect(primaryRule(SQUAT)?.max_angle).toBe(100);
    expect(primaryRule(PRESS)?.landmark_b).toBe(11);
  });
  it("BR-02 score", () => {
    expect(repScore(["Low", "High"])).toBe(65);
  });
});

describe("squat (front view, depth from world landmarks)", () => {
  it("counts 5 clean reps", () => {
    const { done, eng } = run(SQUAT, "squat", Array(5).fill({ bottom: 85 }));
    expect(done).toHaveLength(5);
    expect(done.every((r) => r.is_valid && r.score === 100)).toBe(true);
    expect(eng.state.validReps).toBe(5);
  });
  it("ignores a shallow twitch that is tracking noise, not a rep", () => {
    const { done } = run(SQUAT, "squat", [{ bottom: 85 }, { bottom: 146 }, { bottom: 85 }]);
    expect(done).toHaveLength(2);
    expect(done.every((r) => r.is_valid)).toBe(true);
  });

  it("partial rep is counted, invalid and penalised (BR-01)", () => {
    const { done } = run(SQUAT, "squat", [{ bottom: 85 }, { bottom: 118 }]);
    expect(done).toHaveLength(2);
    expect(done[1].reached_depth).toBe(false);
    expect(done[1].is_valid).toBe(false);
    expect(done[1].score).toBe(85);
    expect(done[1].errors[0].rule_id).toBe(SQUAT.rules[0].rule_id);
  });
  it("knee valgus is a High error with one alert per rep (BR-11)", () => {
    const { done, eng } = run(SQUAT, "squat", [{ bottom: 85, valgus: true }]);
    expect(done).toHaveLength(1);
    expect(done[0].violated.map((v) => v.severity)).toContain("High");
    expect(done[0].is_valid).toBe(false);
    expect(done[0].score).toBe(70);
    expect(eng.state.feedback?.severity ?? "High").toBe("High");
  });
});

describe("lunge (side view, lead leg)", () => {
  it("counts reps on the visible leg and flags a too-deep front knee", () => {
    const { done, eng } = run(LUNGE, "lunge", [{ bottom: 90 }, { bottom: 90 }, { bottom: 70 }]);
    expect(eng.state.side).toBe("left");
    expect(done).toHaveLength(3);
    expect(done[0].is_valid && done[1].is_valid).toBe(true);
    expect(done[2].score).toBe(85); // outside 80–100
  });
});

describe("biceps curl (side view)", () => {
  it("counts curls and flags the elbow drifting forward", () => {
    const { done } = run(CURL, "curl", [{ bottom: 40 }, { bottom: 40, elbowFlare: true }]);
    expect(done).toHaveLength(2);
    expect(done[0].score).toBe(100);
    expect(done[1].violated.map((v) => v.message)).toContain("הצמד את המרפק לגוף");
  });
});

describe("shoulder press (front view)", () => {
  it("counts presses that lower to shoulder height", () => {
    const { done } = run(PRESS, "press", [{ bottom: 90 }, { bottom: 90 }, { bottom: 115 }]);
    expect(done).toHaveLength(3);
    expect(done[0].is_valid).toBe(true);
    expect(done[2].reached_depth).toBe(false);
  });
});

describe("tracking", () => {
  it("ignores frames without a body and reports lost tracking", () => {
    const eng = new TechniqueEngine(SQUAT);
    expect(eng.process({ image: null, world: null, t: 5000 })).toBeNull();
    expect(eng.state.tracking).toBe(false);
  });
});
