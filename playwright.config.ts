import { defineConfig } from "@playwright/test";
import { loadSmokeEnvironment, validateSmokeEnvironment } from "./tests/e2e/support/smoke-config";

loadSmokeEnvironment();

const smoke = validateSmokeEnvironment();
const useLocalServer = smoke.target === "local";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "mvp-core.smoke.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 180_000,
  expect: {
    timeout: 15_000
  },
  globalSetup: "./tests/e2e/global.setup.ts",
  use: {
    baseURL: smoke.baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: useLocalServer
    ? {
        command: "npm run build && npm run start",
        env: process.env as Record<string, string>,
        url: smoke.baseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000
      }
    : undefined
});
