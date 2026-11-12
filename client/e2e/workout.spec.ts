/**
 * Live workout end to end on a phone viewport: camera permission → consent → setup check → live set with
 * real-time counting and feedback → rest → summary → sync → report. The pose model is replaced by a scripted
 * body so the outcome is known in advance (8 clean squats, 1 partial, 1 with knees caving in).
 */
import { expect, test } from "@playwright/test";
import { register, replay } from "./helpers";

test("trainee squat workout, live feedback and report (UC-1, TC-01, TC-02)", async ({ page }) => {
  const reps = [...Array(8).fill({ bottom: 85 }), { bottom: 118 }, { bottom: 85, valgus: true }];
  await replay(page, "squat", reps);
  page.on("dialog", (d) => d.accept());
  await register(page, `e2e-${Date.now()}@test.io`);
  await page.goto("/");
  await page.getByRole("button", { name: "התחלה" }).first().click();

  // consent (NFR-08), then the body-visibility check on screen 2
  await page.getByTestId("consent-box").check();
  await page.getByTestId("consent-ok").click();
  await expect(page.getByTestId("start-set")).toBeEnabled();
  await page.getByTestId("start-set").click();

  // screen 3: the counter follows the scripted reps in real time, with one correction per rep
  const counter = page.getByTestId("rep-counter");
  await expect(counter).toHaveText("3", { timeout: 30_000 });
  // the coach varies its wording (src/engine/coach.ts), so accept any phrasing of the knee correction
  await expect(page.getByTestId("feedback")).toContainText(/ברכיים|ברכיים החוצה|פתח את הברכיים/, { timeout: 40_000 });
  // the set ends by itself at the target of 10 reps → rest screen
  await expect(page.getByTestId("skip-rest")).toBeVisible({ timeout: 40_000 });
  await page.getByTestId("end-workout").click();

  // summary from local data, then synced to the server
  await expect(page.getByTestId("summary-reps")).toHaveText("10");
  const score = Number(await page.getByTestId("summary-score").innerText());
  expect(score).toBe(Math.round((8 * 100 + 85 + 70) / 10)); // BR-02: partial −15, valgus −30
  await expect(page.getByTestId("sync-status")).toContainText("נשמר בשרת", { timeout: 20_000 });
  await page.getByTestId("open-report").click();
  await expect(page.getByTestId("report-score")).toHaveText(String(Math.round((8 * 100 + 85 + 70) / 10)));
});

test("offline set is kept on the phone and synced later (TC-03, NFR-12)", async ({ page, context }) => {
  await replay(page, "squat", Array(10).fill({ bottom: 85 }));
  page.on("dialog", (d) => d.accept());
  await register(page, `off-${Date.now()}@test.io`);
  await page.goto("/");
  await page.getByRole("button", { name: "התחלה" }).first().click();
  await page.getByTestId("consent-box").check();
  await page.getByTestId("consent-ok").click();
  await expect(page.getByTestId("start-set")).toBeEnabled();
  await page.waitForLoadState("networkidle"); // live and summary screens are prefetched on the setup screen
  await context.setOffline(true); // signal lost before the set starts
  await page.getByTestId("start-set").click();
  await expect(page.getByTestId("skip-rest")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("end-workout").click();
  await expect(page.getByTestId("sync-status")).toContainText("נשמר במכשיר");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByTestId("sync-status")).toContainText("נשמר בשרת", { timeout: 30_000 });
});
