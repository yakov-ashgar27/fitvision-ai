/**
 * Real MediaPipe in a real browser: fake camera fed from a video of a person (FAKE_VIDEO), classic worker,
 * WASM and model served by the app itself. Records FPS and latency to test-results/pose-metrics.json.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

test.skip(!process.env.FAKE_VIDEO, "set FAKE_VIDEO to a .y4m/.mjpeg of a person");

test("pose model detects a body from the camera in real time", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  await page.goto("/diag");
  await expect(page.getByTestId("diag-landmarks")).toHaveText("33", { timeout: 90_000 });
  await page.waitForTimeout(8_000); // let FPS and latency settle
  const fps = Number(await page.getByTestId("diag-fps").innerText());
  const p50 = await page.getByTestId("diag-p50").innerText();
  const p95 = await page.getByTestId("diag-p95").innerText();
  const meta = await page.getByTestId("diag").innerText();
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/pose-metrics.json", JSON.stringify({ fps, p50, p95, meta, logs: logs.slice(-20) }, null, 2));
  expect(fps).toBeGreaterThan(0);
});
