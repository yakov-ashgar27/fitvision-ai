/** Current workout plan state, kept across the setup → live → summary screens (and page reloads). */
import type { Exercise } from "./api/types";

export interface WorkoutItem {
  exercise: Exercise;
  target_sets: number;
  target_reps: number;
  rest_seconds: number;
}

export interface WorkoutState {
  localId: string;
  planId: number | null;
  items: WorkoutItem[];
  index: number;
  setsDone: number; // for the current item
}

const KEY = "fv:workout";

export function loadWorkout(): WorkoutState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as WorkoutState) : null;
  } catch {
    return null;
  }
}

export function saveWorkout(w: WorkoutState | null): void {
  try {
    if (w) sessionStorage.setItem(KEY, JSON.stringify(w));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const CAMERA_TIPS: Record<"Front" | "Side", { title: string; steps: string[] }> = {
  Front: {
    title: "מבט חזית",
    steps: ["הניחו את הטלפון בגובה המותניים, 2 עד 3 מטרים מכם", "עמדו מול המצלמה, כך שכל הגוף נכנס לתמונה מהראש ועד כפות הרגליים", "ודאו שהחדר מואר ושאין אור חזק מאחוריכם"],
  },
  Side: {
    title: "מבט צד",
    steps: ["הניחו את הטלפון בגובה המותניים, 2 עד 3 מטרים מכם", "עמדו בצד למצלמה, כשהצד שעובד קרוב יותר לטלפון", "ודאו שכל הגוף נכנס לתמונה ושהחדר מואר"],
  },
};
