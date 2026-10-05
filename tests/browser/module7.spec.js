import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fixture(page, initial = {}) {
  let preferences = { language: "en", theme: "light", reducedMotion: false, defaultAiModel: "fixture-model", replyLength: "medium", speechLanguage: "en-AU", voiceEnabled: false, ...initial };
  let summaryCalls = 0; let sendCalls = 0; const calendarCalls = [];
  const message = { id: "fixture-1", sender: "tester@example.com", recipients: ["reader@example.com"], subject: "Fixture planning", preview: "Review the proposal.", body_plain: "Please review the proposal.", unread: false, starred: false, category: "Primary", attachments: [] };
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === "/api/v1/auth/session") body = { authenticated: true, csrfToken: "fixture", providers: { google: true }, user: { id: "fixture", displayName: "Test Reader", email: "reader@example.com" } };
    else if (url.pathname === "/api/v1/accounts") body = { accounts: [{ id: "fixture", email: "reader@example.com", status: "CONNECTED", scopes: ["gmail.modify"] }] };
    else if (url.pathname === "/api/v1/settings") {
      if (route.request().method() === "PATCH") Object.assign(preferences, route.request().postDataJSON());
      body = { settings: preferences, allowedAiModels: ["fixture-model"] };
    } else if (url.pathname === "/api/v1/voice/capabilities") body = { available: true, maxBytes: 10485760, maxSeconds: 60, languages: ["en-AU", "en-US"] };
    else if (url.pathname === "/api/v1/voice/transcriptions") body = { text: "Show my tasks" };
    else if (url.pathname === "/api/v1/emails") body = { messages: [message], sync: { status: "completed" } };
    else if (url.pathname === "/api/v1/emails/fixture-1") body = message;
    else if (url.pathname === "/api/v1/emails/fixture-1/reply-metadata") body = { reply_to: ["support@example.com"], subject: message.subject };
    else if (url.pathname === "/api/v1/emails/sync") body = { jobId: "fixture-job", status: "syncing" };
    else if (url.pathname.startsWith("/api/v1/emails/sync/")) body = { sync: { status: "completed" } };
    else if (url.pathname === "/api/v1/ai/classify") body = { classifications: {}, warning: null };
    else if (url.pathname === "/api/v1/ai/summarise") { summaryCalls++; body = { summary: "Review the proposal.", bullets: [] }; }
    else if (url.pathname === "/api/v1/ai/draft-reply") body = { draft: "Thank you. I will review it." };
    else if (url.pathname === "/api/v1/ai/compose") body = { subject: "AI subject", draft: "User-reviewed generated draft." };
    else if (url.pathname === "/api/v1/ai/extract") body = { events: [{ title: "Review meeting", date: "tomorrow", start: null, end: null, location: "Room 1" }], tasks: [] };
    else if (url.pathname === "/api/v1/calendar/events") { calendarCalls.push(route.request().postDataJSON()); await new Promise(resolve => setTimeout(resolve, 250)); body = { id: "event-1", created: true, htmlLink: "https://calendar.google.com/event?eid=fixture" }; }
    else if (url.pathname === "/api/v1/emails/send") { sendCalls++; body = { status: "sent" }; }
    else body = {};
    await route.fulfill({ json: body });
  });
  await page.goto("/"); await expect(page.locator("[data-email]")).toBeVisible();
  return { summaryCalls: () => summaryCalls, sendCalls: () => sendCalls, calendarCalls };
}

for (const width of [1280, 320]) {
  test(`calendar review, cancellation, confirmation and focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const calls = await fixture(page, { theme: width === 320 ? "dark" : "light" });
    await page.locator("[data-email]").click();
    await page.locator("[data-ai-extract]").click();
    await page.locator("[data-add-calendar]").click();
    expect(calls.calendarCalls).toHaveLength(0);
    await page.locator('[data-cal-field="title"]').focus();
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("[data-confirm-calendar]")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-add-calendar]")).toBeFocused();
    await page.locator("[data-add-calendar]").click();
    await page.locator("[data-confirm-calendar]").click();
    await expect(page.getByRole("alert").filter({ hasText: "Choose the event date." })).toBeVisible();
    expect(calls.calendarCalls).toHaveLength(0);
    await page.locator('[data-cal-field="title"]').fill("Reviewed event");
    await page.locator('[data-cal-field="date"]').fill("2026-10-12");
    await page.locator('[data-cal-field="allDay"]').check();
    await page.waitForTimeout(900);
    await expect(page.locator('[data-cal-field="title"]')).toHaveValue("Reviewed event");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("[data-confirm-calendar]").click();
    await expect(page.locator("[data-confirm-calendar]")).toBeDisabled();
    await expect(page.getByRole("link", { name: "Open in Google Calendar" })).toBeVisible();
    expect(calls.calendarCalls).toHaveLength(1);
    expect(calls.calendarCalls[0]).toMatchObject({ title: "Reviewed event", startsAt: "2026-10-12", allDay: true, confirmed: true });
    expect(errors).toEqual([]);
  });
}

test("custom compose and Sent retain the reviewed sending contract", async ({ page }) => {
  const calls = await fixture(page);
  await page.locator("[data-compose]").click();
  await page.locator('[data-ai-instructions="compose"]').fill("Write a short update");
  await page.locator('[data-custom-draft="compose"]').click();
  await expect(page.locator("#compose-body")).toHaveValue("User-reviewed generated draft.");
  expect(calls.sendCalls()).toBe(0);
  await page.locator('[data-nav="sent"]').click();
  await expect(page.getByRole("heading", { name: "Sent", exact: true })).toBeVisible();
  await expect(page.locator("[data-email]")).toHaveCount(1);
});

for (const width of [1280, 320]) {
  test(`settings, keyboard voice review, and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const calls = await fixture(page);
    await page.locator('[data-nav="settings"]').click();
    await page.locator('[data-preference="theme"]').selectOption("dark");
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    await page.locator('[data-preference="reducedMotion"]').check();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
    await expect(page.getByRole("status").first()).toHaveText("Settings saved");
    let results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.locator('[data-preference="language"]').selectOption("zh-CN");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { name: "设置", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-theme", "dark");
    await page.locator('[data-nav="settings"]').click();
    await page.locator('[data-preference="language"]').selectOption("en");
    await page.getByRole("button", { name: "Inbox", exact: true }).click();
    await page.locator("[data-email]").focus(); await page.keyboard.press("Enter");
    await page.locator("[data-voice]").click();
    await expect(page.locator("#voice-transcript")).toBeFocused();
    await page.locator("#voice-transcript").fill("delete every email");
    await page.locator("[data-run-command]").click();
    await expect(page.getByRole("alert").filter({ hasText: "Unsupported command" })).toBeVisible();
    expect(calls.summaryCalls()).toBe(0);
    await page.locator("#voice-transcript").fill("Summarise the current email");
    await page.waitForTimeout(900); // Let the mailbox fixture's sync completion update the app.
    await expect(page.locator("#voice-transcript")).toHaveValue("Summarise the current email");
    expect(calls.summaryCalls()).toBe(0);
    await page.locator("[data-run-command]").click();
    await expect.poll(calls.summaryCalls).toBe(1);
    await page.locator("[data-voice]").click();
    await page.keyboard.press("Escape");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(page.locator("[data-voice]")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    await page.screenshot({ path: `build/module7-browser-results/reading-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}

test("drafts survive voice modal and send requires a separate confirmation", async ({ page }) => {
  const calls = await fixture(page);
  await page.locator("[data-compose]").click();
  await page.locator("#compose-to").fill("fixture@example.com");
  await page.locator("#compose-subject").fill("Review");
  await page.locator("#compose-body").fill("Keep this edited draft.");
  await page.locator("[data-voice]").click();
  await page.locator("#voice-transcript").fill("send email");
  await page.locator("[data-run-command]").click();
  expect(calls.sendCalls()).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#compose-body")).toHaveValue("Keep this edited draft.");
  await page.locator("[data-send]").click();
  await expect(page.locator("#confirmed-body")).toHaveValue("Keep this edited draft.");
  expect(calls.sendCalls()).toBe(0);
  await page.locator("[data-confirm-send]").click();
  await expect.poll(calls.sendCalls).toBe(1);
});

test("real browser media capture pauses, releases and requires review", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  await fixture(page, { voiceEnabled: true });
  const mediaProbe = await page.evaluate(async () => {
    let stage = "getUserMedia";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stage = "MediaRecorder constructor";
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      stage = "MediaRecorder start";
      recorder.start(); recorder.stop(); stream.getTracks().forEach(track => track.stop());
      return "ok";
    } catch (error) { return `${stage}: ${error.name}: ${error.message}`; }
  });
  expect(mediaProbe).toBe("ok");
  await page.locator("[data-voice]").click();
  await page.locator("[data-record]").click();
  await expect.poll(async () => ({ status: await page.locator("[data-voice-status]").textContent(), errors: await page.locator('[role="dialog"] [role="alert"]').allTextContents() })).toEqual({ status: "Recording…", errors: [] });
  await expect(page.locator("[data-voice-status]")).toHaveText("Recording…");
  await page.locator("[data-pause]").click();
  await expect(page.locator("[data-voice-status]")).toHaveText("Paused");
  await page.locator("[data-pause]").click();
  await page.waitForTimeout(500);
  await page.locator("[data-finish-recording]").click();
  await expect(page.locator("#voice-transcript")).toHaveValue("Show my tasks");
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("heading", { name: "Tasks & events" })).toBeVisible();
  await expect(page.getByText("Project Meeting", { exact: true })).toHaveCount(0);
  await context.close();
});
