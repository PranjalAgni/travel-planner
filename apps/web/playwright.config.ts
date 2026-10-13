import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 3100;
const API_PORT = 4100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      // Routing points at a closed port so the API falls back to deterministic estimates.
      command: "npm run dev -w server",
      cwd: "../..",
      env: { PORT: String(API_PORT), OSRM_URL: "http://127.0.0.1:9" },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `npx next build && npx next start --port ${WEB_PORT}`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
