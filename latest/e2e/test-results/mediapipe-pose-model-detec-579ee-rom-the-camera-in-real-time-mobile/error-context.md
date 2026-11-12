# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mediapipe.spec.ts >> pose model detects a body from the camera in real time
- Location: e2e/mediapipe.spec.ts:10:1

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('diag-landmarks')
Expected: "33"
Received: "0"
Timeout:  90000ms

Call log:
  - Expect "toHaveText" getByTestId('diag-landmarks') with timeout 90000ms
  - waiting for getByTestId('diag-landmarks')
    179 × locator resolved to <b data-testid="diag-landmarks">0</b>
        - unexpected value "0"

```

```yaml
- text: "0"
```

# Test source

```ts
  1  | /**
  2  |  * Real MediaPipe in a real browser: fake camera fed from a video of a person (FAKE_VIDEO), classic worker,
  3  |  * WASM and model served by the app itself. Records FPS and latency to test-results/pose-metrics.json.
  4  |  */
  5  | import { expect, test } from "@playwright/test";
  6  | import { writeFileSync, mkdirSync } from "node:fs";
  7  | 
  8  | test.skip(!process.env.FAKE_VIDEO, "set FAKE_VIDEO to a .y4m/.mjpeg of a person");
  9  | 
  10 | test("pose model detects a body from the camera in real time", async ({ page }) => {
  11 |   const logs: string[] = [];
  12 |   page.on("console", (m) => logs.push(m.text()));
  13 |   await page.goto("/diag");
> 14 |   await expect(page.getByTestId("diag-landmarks")).toHaveText("33", { timeout: 90_000 });
     |                                                    ^ Error: expect(locator).toHaveText(expected) failed
  15 |   await page.waitForTimeout(8_000); // let FPS and latency settle
  16 |   const fps = Number(await page.getByTestId("diag-fps").innerText());
  17 |   const p50 = await page.getByTestId("diag-p50").innerText();
  18 |   const p95 = await page.getByTestId("diag-p95").innerText();
  19 |   const meta = await page.getByTestId("diag").innerText();
  20 |   mkdirSync("test-results", { recursive: true });
  21 |   writeFileSync("test-results/pose-metrics.json", JSON.stringify({ fps, p50, p95, meta, logs: logs.slice(-20) }, null, 2));
  22 |   expect(fps).toBeGreaterThan(0);
  23 | });
  24 | 
```