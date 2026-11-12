/**
 * Technique engine (section 4.6): joint angles → rep-counting state machine (figure 4.5) → TechniqueRules.
 * Everything here runs on the phone; only the resulting numbers are sent to the server.
 *
 * The counting joint is data, not code (NFR-13): it is the exercise's Bottom-phase rule with a max angle
 * (e.g. squat knee ≤ 100°). Thresholds: enter Down below 150°, Standing again above 160° (hysteresis).
 * A dip that is shorter than 0.6 s or never goes 10° below the Down threshold is tracking noise, not a rep
 * (found in the first real-phone trial: 217 ms and 317 ms "reps" while stepping into the frame).
 */
import type { ErrorIn, Exercise, RepIn, Rule, Severity } from "../api/types";
import { angle, isLeft, Lm, meanVisibility, mirror, MovingAverage, visible } from "./geometry";

export type EnginePhase = "Standing" | "Down" | "Bottom" | "Up";
export const SEVERITY_PENALTY: Record<Severity, number> = { Low: 5, Med: 15, High: 30 };
const SEV_RANK: Record<Severity, number> = { Low: 1, Med: 2, High: 3 };

export interface Frame {
  image: Lm[] | null;
  world: Lm[] | null;
  t: number; // ms
}

export interface Feedback {
  ruleId: number;
  message: string;
  severity: Severity;
  joints: number[];
}

export interface CompletedRep extends RepIn {
  score: number;
  is_valid: boolean;
  violated: { rule_id: number; severity: Severity; message: string }[];
}

export interface EngineState {
  phase: EnginePhase;
  angle: number | null;
  reps: number;
  validReps: number;
  partials: number;
  tracking: boolean; // false when the body is not fully visible
  side: "left" | "right" | "both";
  feedback: Feedback | null;
}

export interface EngineOptions {
  downBelow?: number;
  standAbove?: number;
  riseFromMin?: number;
  persistFrames?: number;
  aspect?: number; // image width / height
  hipDropMin?: number;
  minRepMs?: number;
  minDescent?: number;
  now?: () => Date;
}

export function primaryRule(ex: Exercise): Rule | undefined {
  return (
    ex.rules.find((r) => r.phase === "Bottom" && r.max_angle != null) ?? ex.rules.find((r) => r.max_angle != null)
  );
}

export function repScore(severities: Severity[]): number {
  return Math.max(0, 100 - severities.reduce((s, x) => s + SEVERITY_PENALTY[x], 0));
}

type Pts = [number, number, number];

export class TechniqueEngine {
  readonly primary: Rule;
  private readonly rules: Rule[];
  private readonly o: Required<Omit<EngineOptions, "now">> & { now: () => Date };
  private readonly useHipDrop: boolean;
  state: EngineState;

  private smooth = new MovingAverage(5);
  private ruleSmooth = new Map<number, MovingAverage>();
  private persist = new Map<number, number>();
  private repViolations = new Map<number, { severity: Severity; message: string; value: number }>();
  private minAngle = Infinity;
  private maxAngle = -Infinity;
  private bottomSnapshot = new Map<number, number>();
  private upBest = new Map<number, number>();
  private errorsAt = new Map<number, string>();
  private repStart = 0;
  private sideVotes: number[] = [];
  private lockedSide: "left" | "right" | null = null;
  private thighLen = 0; // standing hip–knee vertical distance, for the squat depth aid
  private hipDrop = 0;
  private lastSeen = 0;
  private feedbackRank = 0;

  constructor(
    private readonly exercise: Exercise,
    opts: EngineOptions = {},
  ) {
    const p = primaryRule(exercise);
    if (!p) throw new Error(`exercise ${exercise.name} has no counting rule`);
    this.primary = p;
    this.rules = exercise.rules;
    this.o = {
      downBelow: 150,
      standAbove: 160,
      riseFromMin: 10,
      persistFrames: 3,
      aspect: 4 / 3,
      hipDropMin: 0.6,
      minRepMs: 600,
      minDescent: 10,
      now: () => new Date(),
      ...opts,
    };
    // front-view knee counting (squat) also requires the hips to drop (section 4.6)
    this.useHipDrop = exercise.camera_view === "Front" && [25, 26].includes(p.landmark_b);
    this.state = { phase: "Standing", angle: null, reps: 0, validReps: 0, partials: 0, tracking: false, side: "both", feedback: null };
  }

  get depth(): number {
    return Number(this.primary.max_angle);
  }

  private sides(rule: Rule): Pts[] {
    const left: Pts = [rule.landmark_a, rule.landmark_b, rule.landmark_c];
    const right = left.map(mirror) as Pts;
    const ruleIsLeft = isLeft(rule.landmark_b);
    const [l, r] = ruleIsLeft ? [left, right] : [right, left];
    if (this.exercise.camera_view === "Front") return [l, r];
    return [this.lockedSide === "right" ? r : l];
  }

  /** Angle for a rule, averaged over visible sides (front) or on the side facing the camera (side view). */
  private ruleAngle(rule: Rule, f: Frame, use3d: boolean): number {
    const src = use3d && f.world ? f.world : f.image!;
    const vis = f.image!;
    const vals: number[] = [];
    for (const [a, b, c] of this.sides(rule)) {
      if (!visible([vis[a], vis[b], vis[c]])) continue;
      vals.push(angle(src[a], src[b], src[c], use3d && !!f.world, use3d && f.world ? 1 : this.o.aspect));
    }
    return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : NaN;
  }

  private chooseSide(f: Frame) {
    if (this.exercise.camera_view === "Front" || this.lockedSide) return;
    const p = this.primary;
    const l = [p.landmark_a, p.landmark_b, p.landmark_c].map((i) => (isLeft(p.landmark_b) ? i : mirror(i)));
    const r = l.map(mirror);
    const img = f.image!;
    // the leg/arm nearer the lens is more visible and has a smaller z (lead limb, section 4.6)
    const score = (ids: number[]) => meanVisibility(ids.map((i) => img[i])) - 0.1 * (ids.reduce((s, i) => s + (img[i]?.z ?? 0), 0) / ids.length);
    this.sideVotes.push(score(l) >= score(r) ? -1 : 1);
    if (this.sideVotes.length >= 15) {
      this.lockedSide = this.sideVotes.reduce((s, x) => s + x, 0) <= 0 ? "left" : "right";
      this.state.side = this.lockedSide;
    }
  }

  private updateHipDrop(f: Frame) {
    if (!this.useHipDrop || !f.image) return;
    const img = f.image;
    const hipY = (img[23].y + img[24].y) / 2;
    const kneeY = (img[25].y + img[26].y) / 2;
    const gap = kneeY - hipY; // image y grows downward
    if (this.state.phase === "Standing" && gap > 0) this.thighLen = this.thighLen ? 0.9 * this.thighLen + 0.1 * gap : gap;
    this.hipDrop = this.thighLen ? 1 - gap / this.thighLen : 0;
  }

  /** Feed one pose frame. Returns a completed repetition when one ends. */
  process(f: Frame): CompletedRep | null {
    if (!f.image) {
      this.state.tracking = f.t - this.lastSeen < 2000;
      return null;
    }
    this.chooseSide(f);
    const raw = this.ruleAngle(this.primary, f, true);
    if (!Number.isFinite(raw)) {
      this.state.tracking = f.t - this.lastSeen < 2000;
      return null;
    }
    this.lastSeen = f.t;
    this.state.tracking = true;
    this.updateHipDrop(f);
    const a = this.smooth.push(raw);
    this.state.angle = a;
    this.maxAngle = Math.max(this.maxAngle, a);
    if (this.state.phase !== "Standing") {
      if (a < this.minAngle) {
        this.minAngle = a;
        // snapshot every Bottom rule at the deepest point; they are judged when the rep turns upward
        for (const r of this.rules) if (r.phase === "Bottom" && r !== this.primary) this.bottomSnapshot.set(r.rule_id, this.ruleAngle(r, f, false));
      }
    }
    this.checkContinuousRules(f);

    const s = this.state;
    switch (s.phase) {
      case "Standing":
        if (a < this.o.downBelow) {
          s.phase = "Down";
          this.repStart = f.t;
          this.minAngle = a;
          s.feedback = null;
          this.feedbackRank = 0;
        }
        return null;
      case "Down":
        if (a <= this.depth && (!this.useHipDrop || this.hipDrop >= this.o.hipDropMin)) s.phase = "Bottom";
        else if (a > this.o.standAbove) {
          const noise = f.t - this.repStart < this.o.minRepMs || this.minAngle > this.o.downBelow - this.o.minDescent;
          if (noise) {
            this.reset();
            return null;
          }
          return this.finish(f, false);
        }
        return null;
      case "Bottom":
        if (a >= this.minAngle + this.o.riseFromMin) {
          s.phase = "Up";
          this.judgeBottom(f);
        }
        return null;
      case "Up":
        if (a > this.o.standAbove) return this.finish(f, true);
        return null;
    }
  }

  private violate(rule: Rule, value: number, f: Frame) {
    if (!this.repViolations.has(rule.rule_id)) {
      this.repViolations.set(rule.rule_id, { severity: rule.severity, message: rule.error_message, value });
      this.errorsAt.set(rule.rule_id, this.o.now().toISOString());
    }
    // BR-11: one alert per rep, the most severe one wins
    const rank = SEV_RANK[rule.severity];
    if (rank > this.feedbackRank) {
      this.feedbackRank = rank;
      this.state.feedback = { ruleId: rule.rule_id, message: rule.error_message, severity: rule.severity, joints: this.sides(rule)[0] };
    }
    void f;
  }

  private outOfRange(rule: Rule, v: number): boolean {
    return (rule.min_angle != null && v < Number(rule.min_angle)) || (rule.max_angle != null && v > Number(rule.max_angle));
  }

  private checkContinuousRules(f: Frame) {
    const phase = this.state.phase;
    if (phase === "Standing") return;
    for (const r of this.rules) {
      if (r === this.primary || r.phase === "Bottom") continue;
      if (r.phase === "Up") {
        // Up rules describe the top of the movement: keep the best value reached while rising, judge at the end
        if (phase !== "Up") continue;
        const raw = this.ruleAngle(r, f, false);
        if (!Number.isFinite(raw)) continue;
        const prev = this.upBest.get(r.rule_id);
        const better = r.min_angle != null ? Math.max(prev ?? -Infinity, raw) : Math.min(prev ?? Infinity, raw);
        this.upBest.set(r.rule_id, better);
        continue;
      }
      if (r.phase !== null && r.phase !== phase) continue;
      let ma = this.ruleSmooth.get(r.rule_id);
      if (!ma) this.ruleSmooth.set(r.rule_id, (ma = new MovingAverage(5)));
      const raw = this.ruleAngle(r, f, false);
      if (!Number.isFinite(raw)) continue;
      const v = ma.push(raw);
      const n = this.outOfRange(r, v) ? (this.persist.get(r.rule_id) ?? 0) + 1 : 0;
      this.persist.set(r.rule_id, n);
      if (n >= this.o.persistFrames) this.violate(r, v, f); // 3 consecutive frames (section 4.6, step 3)
    }
  }

  private judgeBottom(f: Frame) {
    if (this.outOfRange(this.primary, this.minAngle)) this.violate(this.primary, this.minAngle, f);
    for (const r of this.rules) {
      if (r.phase !== "Bottom" || r === this.primary) continue;
      const v = this.bottomSnapshot.get(r.rule_id);
      if (v !== undefined && Number.isFinite(v) && this.outOfRange(r, v)) this.violate(r, v, f);
    }
  }

  private finish(f: Frame, reachedDepth: boolean): CompletedRep {
    const s = this.state;
    if (!reachedDepth) this.violate(this.primary, this.minAngle, f); // partial rep: counted, invalid (BR-01)
    else
      for (const r of this.rules) {
        if (r.phase !== "Up") continue;
        const best = this.upBest.get(r.rule_id);
        if (best !== undefined && this.outOfRange(r, best)) this.violate(r, best, f);
      }
    const violated = [...this.repViolations.entries()].map(([rule_id, v]) => ({ rule_id, severity: v.severity, message: v.message }));
    const severities = violated.map((v) => v.severity);
    const score = repScore(severities);
    const is_valid = reachedDepth && !severities.includes("High");
    const errors: ErrorIn[] = [...this.repViolations.entries()].map(([rule_id, v]) => ({
      rule_id,
      measured_value: Math.round(v.value * 10) / 10,
      occurred_at: this.errorsAt.get(rule_id) ?? this.o.now().toISOString(),
      feedback_text: v.message,
    }));
    s.reps += 1;
    if (is_valid) s.validReps += 1;
    if (!reachedDepth) s.partials += 1;
    const rep: CompletedRep = {
      rep_number: s.reps,
      duration_ms: Math.round(f.t - this.repStart),
      min_angle_deg: Math.round(this.minAngle * 10) / 10,
      max_angle_deg: Math.round(Math.min(180, this.maxAngle) * 10) / 10,
      reached_depth: reachedDepth,
      errors,
      score,
      is_valid,
      violated,
    };
    this.reset();
    return rep;
  }

  /** Back to Standing, dropping everything collected for the current movement. */
  private reset() {
    this.state.phase = "Standing";
    this.minAngle = Infinity;
    this.maxAngle = -Infinity;
    this.repViolations.clear();
    this.errorsAt.clear();
    this.bottomSnapshot.clear();
    this.upBest.clear();
    this.persist.clear();
  }
}
