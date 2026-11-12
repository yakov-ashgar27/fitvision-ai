import { describe, expect, it } from "vitest";
import { Coach } from "./coach";
import type { CompletedRep } from "./engine";
import { CURL } from "./exercises.fixture";

const elbow = CURL.rules.find((r) => r.error_message === "הצמד את המרפק לגוף")!;
const rep = (n: number, violated: number[] = [], max = 165): CompletedRep => ({
  rep_number: n,
  duration_ms: 1500,
  min_angle_deg: 60,
  max_angle_deg: max,
  reached_depth: true,
  errors: [],
  score: violated.length ? 85 : 100,
  is_valid: true,
  violated: violated.map((rule_id) => ({ rule_id, severity: "Med" as const, message: "" })),
});

describe("coach (varied cues, first-trial feedback)", () => {
  it("gives one cue per rule per rep, and never the same wording twice in a row", () => {
    const c = new Coach(CURL.name, CURL.rules, 10);
    const texts: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const first = c.onViolation(elbow.rule_id);
      expect(first).not.toBeNull();
      expect(c.onViolation(elbow.rule_id)).toBeNull(); // same rule again in the same rep: silent
      texts.push(first!.text);
      c.onRep(rep(i, [elbow.rule_id]), i);
    }
    for (let i = 1; i < texts.length; i++) expect(texts[i]).not.toBe(texts[i - 1]);
  });

  it("asks to finish the way down when the arm was not straightened", () => {
    const c = new Coach(CURL.name, CURL.rules, 10);
    const cue = c.onRep(rep(1, [], 130), 1);
    expect(cue?.key).toBe("extend");
  });

  it("marks the last rep and the end of the set", () => {
    const c = new Coach(CURL.name, CURL.rules, 10);
    expect(c.onRep(rep(9), 9)?.text).toBe("אחרונה!");
    expect(c.onRep(rep(10), 10)?.key).toBe("done");
  });
});
