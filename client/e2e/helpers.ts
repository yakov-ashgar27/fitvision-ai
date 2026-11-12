import { Page } from "@playwright/test";
import { Kind, RepScript, script } from "../src/engine/synthetic";

/** Feeds a scripted body (landmarks) into the real app pipeline instead of the camera model. */
export async function replay(page: Page, kind: Kind, reps: RepScript[]) {
  const frames = script(kind, reps).map((f) => ({ t: f.t, image: f.image, world: f.world }));
  await page.addInitScript((data) => {
    (window as any).__FV_TEST_FRAMES__ = data;
  }, frames);
}

export async function register(page: Page, email: string, role: "Trainee" | "Trainer" = "Trainee") {
  await page.goto("/register");
  if (role === "Trainer") await page.getByLabel("מאמן כושר").check();
  await page.getByLabel("שם פרטי").fill("בדיקה");
  await page.getByLabel("שם משפחה").fill(role === "Trainee" ? "מתאמן" : "מאמן");
  await page.getByLabel('דוא"ל').fill(email);
  await page.getByLabel("סיסמה (8 תווים לפחות)").fill("Passw0rd!");
  await page.getByRole("button", { name: "יצירת חשבון" }).click();
}

export async function login(page: Page, email: string, password = "Demo1234!") {
  await page.goto("/login");
  await page.getByLabel('דוא"ל').fill(email);
  await page.getByLabel("סיסמה").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
}
