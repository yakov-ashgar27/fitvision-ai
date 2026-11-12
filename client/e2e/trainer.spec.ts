/** Trainer flow on desktop: dashboard → trainee → report → note → export → send (UC-2, TC-05, TC-06). */
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("trainer reviews, exports and sends a report", async ({ page }) => {
  await login(page, "trainer@fitvision.app");
  await expect(page.getByTestId("kpi-active")).toHaveText("2");
  await page.getByTestId("trainee-row").first().click();
  await page.getByTestId("report-link").first().click();
  await expect(page.getByTestId("report-score")).not.toHaveText("—");
  await page.getByTestId("note-input").fill("עבודה טובה. בסט הבא להעמיק את הירידה.");
  await page.getByTestId("add-note").click();
  await expect(page.getByTestId("report-status")).toHaveText(/נסקר|נשלח/);
  const t0 = Date.now();
  const download = page.waitForEvent("download");
  await page.getByTestId("export-xlsx").click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  expect(Date.now() - t0).toBeLessThan(5_000); // NFR-03: file within 5 s
  const pdf = page.waitForEvent("download");
  await page.getByTestId("export-pdf").click();
  expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/);
  await page.getByTestId("send-report").click();
  await expect(page.getByTestId("report-status")).toHaveText("נשלח");
});

test("trainee cannot open the trainer dashboard (RBAC in the UI and the API)", async ({ page }) => {
  await login(page, "trainee@fitvision.app");
  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/$/);
  const status = await page.evaluate(async () => (await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${localStorage.getItem("fv:token")}` } })).status);
  expect(status).toBe(403);
});
