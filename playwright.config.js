import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser", timeout: 30000, workers: 1,
  use: { ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}), baseURL: "http://127.0.0.1:4278", trace: "retain-on-failure", launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } },
  outputDir: "build/module7-browser-results",
  webServer: {
    command: "npm run start", url: "http://127.0.0.1:4278/api/v1/health", reuseExistingServer: false, timeout: 60000,
    env: { HOST: "127.0.0.1", PORT: "4278", APP_BASE_URL: "http://127.0.0.1:4278", REVOMAIL_ENV: "test", DATABASE_URL: "file:./data/module7-browser.db", RUNTIME_KEY_FILE: "./data/module7-browser.key", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", OPENAI_API_KEY: "" }
  }
});
