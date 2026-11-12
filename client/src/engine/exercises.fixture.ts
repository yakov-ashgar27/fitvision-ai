/** The four MVP exercises exactly as seeded on the server (table 4.6), for engine tests. */
import type { Exercise, Rule } from "../api/types";

let id = 1;
const rule = (exercise_id: number, p: Partial<Rule> & Pick<Rule, "landmark_a" | "landmark_b" | "landmark_c" | "severity" | "error_message">): Rule => ({
  rule_id: id++,
  exercise_id,
  rule_name: p.error_message,
  joint: "",
  phase: null,
  min_angle: null,
  max_angle: null,
  ...p,
});

export const SQUAT: Exercise = {
  exercise_id: 1, name: "סקוואט", description: null, muscle_group: null, camera_view: "Front", demo_video_url: null, is_active: true,
  rules: [
    rule(1, { landmark_a: 23, landmark_b: 25, landmark_c: 27, phase: "Bottom", max_angle: 100, severity: "Med", error_message: "רד עמוק יותר" }),
    rule(1, { landmark_a: 25, landmark_b: 27, landmark_c: 28, phase: null, min_angle: 80, severity: "High", error_message: "דחוף את הברכיים החוצה" }),
  ],
};
export const LUNGE: Exercise = {
  exercise_id: 2, name: "לאנג'ים", description: null, muscle_group: null, camera_view: "Side", demo_video_url: null, is_active: true,
  rules: [rule(2, { landmark_a: 23, landmark_b: 25, landmark_c: 27, phase: "Bottom", min_angle: 80, max_angle: 100, severity: "Med", error_message: "שמור על זווית ישרה בברך הקדמית" })],
};
export const CURL: Exercise = {
  exercise_id: 3, name: "כפיפת מרפקים", description: null, muscle_group: null, camera_view: "Side", demo_video_url: null, is_active: true,
  rules: [
    rule(3, { landmark_a: 11, landmark_b: 13, landmark_c: 15, phase: "Bottom", max_angle: 50, severity: "Low", error_message: "השלם את התנועה עד למעלה" }),
    rule(3, { landmark_a: 13, landmark_b: 11, landmark_c: 23, phase: null, max_angle: 20, severity: "Med", error_message: "הצמד את המרפק לגוף" }),
  ],
};
export const PRESS: Exercise = {
  exercise_id: 4, name: "לחיצת כתפיים", description: null, muscle_group: null, camera_view: "Front", demo_video_url: null, is_active: true,
  rules: [
    rule(4, { landmark_a: 13, landmark_b: 11, landmark_c: 23, phase: "Bottom", max_angle: 100, severity: "Med", error_message: "הורד את המשקולות עד גובה הכתפיים" }),
    rule(4, { landmark_a: 11, landmark_b: 13, landmark_c: 15, phase: "Up", min_angle: 160, severity: "Low", error_message: "יישר את הידיים עד הסוף" }),
  ],
};
