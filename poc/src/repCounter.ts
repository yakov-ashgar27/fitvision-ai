/**
 * Rep-counting state machine (figure 4.5): Standing → Down → Bottom → Up → Standing.
 * A rep is counted only on the Up → Standing transition. Returning above the "stand"
 * threshold from Down without reaching depth records a partial (invalid) rep (BR-01).
 * Thresholds are data (TechniqueRules), so they are passed in rather than hard-coded.
 */

export type Phase = "Standing" | "Down" | "Bottom" | "Up";

export interface RepThresholds {
  /** Enter Down when the angle drops below this (default 150°). */
  downBelow: number;
  /** Depth threshold: enter Bottom at or below this (default 100°). */
  depth: number;
  /** Enter Up once the angle rises this much above the minimum (default 10°). */
  riseFromMin: number;
  /** Back to Standing above this (default 160°). The 150/160 gap is the hysteresis. */
  standAbove: number;
}

export const SQUAT_THRESHOLDS: RepThresholds = { downBelow: 150, depth: 100, riseFromMin: 10, standAbove: 160 };

export interface RepEvent {
  kind: "rep" | "partial";
  /** Smallest angle reached during the rep (recorded in Bottom). */
  minAngle: number;
}

export class RepCounter {
  phase: Phase = "Standing";
  reps = 0;
  partials = 0;
  private minAngle = Infinity;

  constructor(private readonly t: RepThresholds = SQUAT_THRESHOLDS) {}

  /** Feed one smoothed angle; returns an event when a rep (or partial rep) completes. */
  update(angle: number): RepEvent | null {
    if (!Number.isFinite(angle)) return null;
    if (this.phase !== "Standing") this.minAngle = Math.min(this.minAngle, angle);

    switch (this.phase) {
      case "Standing":
        if (angle < this.t.downBelow) {
          this.phase = "Down";
          this.minAngle = angle;
        }
        return null;
      case "Down":
        if (angle <= this.t.depth) {
          this.phase = "Bottom";
        } else if (angle > this.t.standAbove) {
          return this.finish("partial");
        }
        return null;
      case "Bottom":
        if (angle >= this.minAngle + this.t.riseFromMin) this.phase = "Up";
        return null;
      case "Up":
        if (angle > this.t.standAbove) return this.finish("rep");
        return null;
    }
  }

  reset(): void {
    this.phase = "Standing";
    this.reps = 0;
    this.partials = 0;
    this.minAngle = Infinity;
  }

  private finish(kind: RepEvent["kind"]): RepEvent {
    const ev: RepEvent = { kind, minAngle: this.minAngle };
    if (kind === "rep") this.reps++;
    else this.partials++;
    this.phase = "Standing";
    this.minAngle = Infinity;
    return ev;
  }
}
