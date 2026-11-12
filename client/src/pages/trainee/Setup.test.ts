import { describe, expect, it } from "vitest";
import type { Lm } from "../../engine/geometry";
import { missingParts } from "./Setup";

const body = (hidden: number[] = []): Lm[] =>
  Array.from({ length: 33 }, (_, i) => ({ x: 0.5, y: 0.5, z: 0, visibility: hidden.includes(i) ? 0.1 : 0.95 }));

describe("setup body check (R-02)", () => {
  it("front view needs both sides", () => {
    expect(missingParts(body(), "Front")).toEqual([]);
    expect(missingParts(body([27, 28]), "Front")).toEqual(["קרסוליים"]);
    expect(missingParts(body([26]), "Front")).toEqual(["ברכיים"]);
  });
  it("side view is satisfied by the side facing the camera", () => {
    // right side hidden behind the body: still fine from the side
    expect(missingParts(body([12, 14, 16, 24, 26, 28]), "Side")).toEqual([]);
    expect(missingParts(body([12, 14, 16, 24, 26, 28, 27]), "Side")).toEqual(["קרסוליים"]);
  });
  it("no person at all", () => {
    expect(missingParts(null, "Front")).toHaveLength(6);
  });
});
