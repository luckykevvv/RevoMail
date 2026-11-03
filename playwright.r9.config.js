import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser/r9", timeout: 30000, workers: 1,
  use: { ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}), baseURL: "http://127.0.0.1:4279", trace: "retain-on-failure" },
  outputDir: "build/r9-browser-results",
  webServer: { command: "npm run test:r9:server", url: "http://127.0.0.1:4279/api/v1/health", reuseExistingServer: false, timeout: 60000,
    env: { HOST: "127.0.0.1", PORT: "4279", APP_BASE_URL: "http://127.0.0.1:4279", REVOMAIL_ENV: "test", RUNTIME_KEY_FILE: "./build/r9-browser.key", GOOGLE_REDIRECT_URI: "http://127.0.0.1:4279/api/v1/auth/google/callback", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", OPENAI_API_KEY: "" } }
});
