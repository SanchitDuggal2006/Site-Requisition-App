import { defineConfig, devices } from "@playwright/test";
const testPort = process.env.TEST_PORT || "4173";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    ...devices["Pixel 7"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/test-server.ts",
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
