import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 8000);
const external = !!process.env.E2E_BASE_URL; // e.g. the full Docker stack on :8080

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        ...(process.env.FAKE_VIDEO ? [`--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`] : []),
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /(workout|mediapipe)\.spec\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /trainer\.spec\.ts/ },
  ],
  webServer: external
    ? undefined
    : {
        command: "bash e2e/start-server.sh",
        url: `http://localhost:${PORT}/api/health`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
