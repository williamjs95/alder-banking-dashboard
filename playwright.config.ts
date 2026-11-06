import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a production build backed by the embedded,
 * in-memory database. Every test gets a fresh browser context, which means a
 * fresh workspace cookie and its own freshly seeded demo company, so tests are
 * independent and can run in parallel.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/support/coverage-setup.ts",
  globalTeardown: "./e2e/support/coverage-report.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: `yarn build && yarn start -p ${PORT}`,
    url: baseURL,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ALDER_EMBEDDED_DB: "1",
      PGLITE_DIR: "memory://",
      // Never let a DATABASE_URL from a local .env file point tests at a real database.
      DATABASE_URL: "",
      // Source maps let browser coverage be attributed to files under src/.
      E2E_SOURCE_MAPS: "1",
    },
  },
});
