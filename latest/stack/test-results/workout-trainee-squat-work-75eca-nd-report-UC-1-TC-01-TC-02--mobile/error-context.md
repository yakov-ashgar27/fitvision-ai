# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: workout.spec.ts >> trainee squat workout, live feedback and report (UC-1, TC-01, TC-02)
- Location: e2e/workout.spec.ts:9:1

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: locator.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for getByTestId('open-report')

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - banner [ref=f1e4]:
    - link "FitVision AI" [ref=f1e5] [cursor=pointer]:
      - /url: /
    - navigation [ref=f1e6]:
      - link "בית" [ref=f1e7] [cursor=pointer]:
        - /url: /
      - link "היסטוריה" [ref=f1e8] [cursor=pointer]:
        - /url: /history
      - link "דוחות" [ref=f1e9] [cursor=pointer]:
        - /url: /reports
      - link "הגדרות" [ref=f1e10] [cursor=pointer]:
        - /url: /settings
    - button "יציאה" [ref=f1e11] [cursor=pointer]
  - main [ref=f1e12]:
    - generic [ref=f1e13]:
      - heading "האימון הופסק" [level=1] [ref=f1e14]
      - generic [ref=f1e15]:
        - generic [ref=f1e16]:
          - text: חזרות
          - generic [ref=f1e17]: "10"
        - generic [ref=f1e18]:
          - text: סטים
          - generic [ref=f1e19]: "1"
        - generic [ref=f1e20]:
          - text: ציון טכניקה
          - generic [ref=f1e21]: "96"
        - generic [ref=f1e22]:
          - text: חזרות תקינות
          - generic [ref=f1e23]: "8"
      - generic [ref=f1e24]:
        - heading "מה לשפר" [level=3] [ref=f1e25]
        - list [ref=f1e26]:
          - listitem [ref=f1e27]:
            - text: רד עמוק יותר
            - generic [ref=f1e28]: (1 חזרות)
          - listitem [ref=f1e29]:
            - text: דחוף את הברכיים החוצה
            - generic [ref=f1e30]: (1 חזרות)
      - generic [ref=f1e31]: נשמר בשרת
      - link "חזרה לדף הבית" [ref=f1e33] [cursor=pointer]:
        - /url: /
```

# Test source

```ts
  1  | /**
  2  |  * Live workout end to end on a phone viewport: camera permission → consent → setup check → live set with
  3  |  * real-time counting and feedback → rest → summary → sync → report. The pose model is replaced by a scripted
  4  |  * body so the outcome is known in advance (8 clean squats, 1 partial, 1 with knees caving in).
  5  |  */
  6  | import { expect, test } from "@playwright/test";
  7  | import { register, replay } from "./helpers";
  8  | 
  9  | test("trainee squat workout, live feedback and report (UC-1, TC-01, TC-02)", async ({ page }) => {
  10 |   const reps = [...Array(8).fill({ bottom: 85 }), { bottom: 118 }, { bottom: 85, valgus: true }];
  11 |   await replay(page, "squat", reps);
  12 |   page.on("dialog", (d) => d.accept());
  13 |   await register(page, `e2e-${Date.now()}@test.io`);
  14 |   await page.goto("/");
  15 |   await page.getByRole("button", { name: "התחלה" }).first().click();
  16 | 
  17 |   // consent (NFR-08), then the body-visibility check on screen 2
  18 |   await page.getByTestId("consent-box").check();
  19 |   await page.getByTestId("consent-ok").click();
  20 |   await expect(page.getByTestId("start-set")).toBeEnabled();
  21 |   await page.getByTestId("start-set").click();
  22 | 
  23 |   // screen 3: the counter follows the scripted reps in real time, with one correction per rep
  24 |   const counter = page.getByTestId("rep-counter");
  25 |   await expect(counter).toHaveText("3", { timeout: 30_000 });
  26 |   await expect(page.getByTestId("feedback")).toContainText("דחוף את הברכיים החוצה", { timeout: 40_000 });
  27 |   // the set ends by itself at the target of 10 reps → rest screen
  28 |   await expect(page.getByTestId("skip-rest")).toBeVisible({ timeout: 40_000 });
  29 |   await page.getByTestId("end-workout").click();
  30 | 
  31 |   // summary from local data, then synced to the server
  32 |   await expect(page.getByTestId("summary-reps")).toHaveText("10");
  33 |   const score = Number(await page.getByTestId("summary-score").innerText());
  34 |   expect(score).toBe(Math.round((8 * 100 + 85 + 70) / 10)); // BR-02: partial −15, valgus −30
  35 |   await expect(page.getByTestId("sync-status")).toContainText("נשמר בשרת", { timeout: 20_000 });
> 36 |   await page.getByTestId("open-report").click();
     |                                         ^ Error: locator.click: Test timeout of 120000ms exceeded.
  37 |   await expect(page.getByTestId("report-score")).toHaveText(String(Math.round((8 * 100 + 85 + 70) / 10)));
  38 | });
  39 | 
  40 | test("offline set is kept on the phone and synced later (TC-03, NFR-12)", async ({ page, context }) => {
  41 |   await replay(page, "squat", Array(10).fill({ bottom: 85 }));
  42 |   page.on("dialog", (d) => d.accept());
  43 |   await register(page, `off-${Date.now()}@test.io`);
  44 |   await page.goto("/");
  45 |   await page.getByRole("button", { name: "התחלה" }).first().click();
  46 |   await page.getByTestId("consent-box").check();
  47 |   await page.getByTestId("consent-ok").click();
  48 |   await expect(page.getByTestId("start-set")).toBeEnabled();
  49 |   await page.waitForLoadState("networkidle"); // live and summary screens are prefetched on the setup screen
  50 |   await context.setOffline(true); // signal lost before the set starts
  51 |   await page.getByTestId("start-set").click();
  52 |   await expect(page.getByTestId("skip-rest")).toBeVisible({ timeout: 60_000 });
  53 |   await page.getByTestId("end-workout").click();
  54 |   await expect(page.getByTestId("sync-status")).toContainText("נשמר במכשיר");
  55 |   await context.setOffline(false);
  56 |   await page.evaluate(() => window.dispatchEvent(new Event("online")));
  57 |   await expect(page.getByTestId("sync-status")).toContainText("נשמר בשרת", { timeout: 30_000 });
  58 | });
  59 | 
```