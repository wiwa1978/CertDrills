import { defineConfig, devices } from "@playwright/test";

const adminPort = Number(process.env.PLAYWRIGHT_PORT ?? 13101);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${adminPort}`;
const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:18787";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.system.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 20_000 },
  timeout: 120_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun run --cwd ../api dev",
      url: `${apiURL}/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `bunx next dev -p ${adminPort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
