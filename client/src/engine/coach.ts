/**
 * Coaching layer on top of the technique engine: turns rule violations and finished reps into varied,
 * short Hebrew cues, so the trainee does not hear the same sentence again and again (first-trial feedback).
 *
 * - every rule has several phrasings; the same phrasing is never used twice in a row
 * - a correction is shown once per rep, then disappears
 * - good reps get praise, partial reps get a "go further" cue for that exercise, and the set gets milestones
 */
import type { Rule, Severity } from "../api/types";
import type { CompletedRep } from "./engine";

export type Tone = "good" | "info" | "warn" | "bad";
export interface Cue {
  text: string;
  tone: Tone;
  key: string; // what the cue is about, for de-duplication
}

/** Extra phrasings per rule name (the rule's own error_message is always the first option). */
const RULE_VARIANTS: Record<string, string[]> = {
  "עומק סקוואט": ["עוד קצת למטה", "ירכיים במקביל לרצפה", "שב עמוק יותר, כאילו לכיסא נמוך"],
  "ברכיים קורסות פנימה": ["ברכיים החוצה, מעל האצבעות", "אל תתן לברכיים ליפול פנימה", "פתח את הברכיים"],
  "עומק לאנג'": ["רד עד שהברך האחורית כמעט נוגעת", "עוד קצת למטה", "רד ישר למטה, לא קדימה"],
  "זווית ברך קדמית": ["ברך קדמית מעל הקרסול", "אל תדחוף את הברך קדימה", "צעד קצת יותר ארוך"],
  "טווח כפיפה מלא": ["עלה עד הכתף", "כופף עד הסוף", "סחוט למעלה"],
  "מרפק צמוד לגוף": ["מרפק צמוד לצלעות", "אל תזיז את הכתף, רק את האמה", "מרפק קבוע במקום"],
  "עומק הורדה": ["הורד עד גובה הסנטר", "עוד קצת למטה לפני הדחיפה", "ירידה מלאה"],
  "יישור מלא": ["דחוף עד למעלה", "ידיים ישרות מעל הראש", "נעל את המרפקים למעלה"],
};

/** The same lists by the default error message, so renamed rules keep their variants. */
const BY_MESSAGE: Record<string, string> = {
  "רד עמוק יותר": "עומק סקוואט",
  "דחוף את הברכיים החוצה": "ברכיים קורסות פנימה",
  "שמור על זווית ישרה בברך הקדמית": "זווית ברך קדמית",
  "השלם את התנועה עד למעלה": "טווח כפיפה מלא",
  "הצמד את המרפק לגוף": "מרפק צמוד לגוף",
  "הורד את המשקולות עד גובה הכתפיים": "עומק הורדה",
  "יישר את הידיים עד הסוף": "יישור מלא",
};

/** "Finish the way back" cues when the joint did not open fully at the end of the rep. */
const EXTEND: Record<string, { below: number; texts: string[] }> = {
  "כפיפת מרפקים": { below: 150, texts: ["רד עם הידיים עד הסוף", "יישר את היד למטה", "פתח את המרפק עד הסוף"] },
  "סקוואט": { below: 165, texts: ["עמוד עד הסוף", "יישר ברכיים למעלה", "סיים את העלייה"] },
  "לאנג'ים": { below: 160, texts: ["חזור לעמידה מלאה", "סיים את העלייה", "עמוד זקוף בין חזרות"] },
};

const PRAISE = ["מצוין!", "חזרה מושלמת", "יפה מאוד", "ככה בדיוק", "טכניקה נקייה", "חזק!", "בול"];

const pick = (() => {
  const last = new Map<string, string>();
  return (key: string, options: string[]): string => {
    const prev = last.get(key);
    const pool = options.length > 1 ? options.filter((o) => o !== prev) : options;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    last.set(key, choice);
    return choice;
  };
})();

const toneOf = (s: Severity): Tone => (s === "High" ? "bad" : s === "Med" ? "warn" : "info");

export class Coach {
  private shownThisRep = new Set<number>();
  private praiseEvery = 1;
  private goodStreak = 0;

  constructor(
    private readonly exerciseName: string,
    private readonly rules: Rule[],
    private readonly target: number,
  ) {}

  /** A rule was just violated during the rep: one cue per rule per rep. */
  onViolation(ruleId: number): Cue | null {
    if (this.shownThisRep.has(ruleId)) return null;
    this.shownThisRep.add(ruleId);
    const rule = this.rules.find((r) => r.rule_id === ruleId);
    if (!rule) return null;
    const extra = RULE_VARIANTS[rule.rule_name] ?? RULE_VARIANTS[BY_MESSAGE[rule.error_message] ?? ""] ?? [];
    const text = pick(`rule-${ruleId}`, [rule.error_message, ...extra]);
    return { text, tone: toneOf(rule.severity), key: `rule-${ruleId}` };
  }

  /** A rep finished: praise, a "go further" cue, or a milestone. */
  onRep(rep: CompletedRep, count: number): Cue | null {
    const shown = this.shownThisRep;
    this.shownThisRep = new Set();
    const left = this.target - count;
    const extend = EXTEND[this.exerciseName];
    const notExtended = extend && rep.max_angle_deg != null && rep.max_angle_deg < extend.below;

    if (rep.violated.length) {
      this.goodStreak = 0;
      const unseen = rep.violated.find((v) => !shown.has(v.rule_id));
      if (unseen) return this.onViolation(unseen.rule_id);
      if (notExtended) return { text: pick("extend", extend.texts), tone: "info", key: "extend" };
      return null;
    }
    if (notExtended) {
      this.goodStreak = 0;
      return { text: pick("extend", extend.texts), tone: "info", key: "extend" };
    }
    this.goodStreak += 1;
    if (left === 0) return { text: "סט הושלם! 🎉", tone: "good", key: "done" };
    if (left === 1) return { text: "אחרונה!", tone: "good", key: "milestone" };
    if (left === 3 && this.target >= 6) return { text: "עוד 3!", tone: "good", key: "milestone" };
    if (count === Math.ceil(this.target / 2) && this.target >= 8) return { text: "חצי דרך 💪", tone: "good", key: "milestone" };
    if (this.goodStreak >= 3 && this.goodStreak % 3 === 0) return { text: `${this.goodStreak} מושלמות ברצף 🔥`, tone: "good", key: "streak" };
    // praise roughly every other good rep, so it stays meaningful
    this.praiseEvery = (this.praiseEvery + 1) % 2;
    return this.praiseEvery === 0 ? { text: pick("praise", PRAISE), tone: "good", key: "praise" } : null;
  }
}
