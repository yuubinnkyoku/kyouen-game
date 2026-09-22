import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120000,
  use: {
    baseURL: "http://127.0.0.1:5173/kyouen-game/",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "C:\\Users\\yuubi\\AppData\\Local\\Temp\\node-portable\\node-v22.17.1-win-x64\\node.exe tools/e2e-servers.cjs",
    port: 5173,
    reuseExistingServer: true,
    timeout: 120000,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
