import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function fixture(page, initial = {}) {
  const { message: messageOverrides = {}, messages: messageFixtures, transcriptionText = "Show my tasks", summaryText = "Review the proposal.", summaryBullets = [], extraction = { events: [{ title: "Review meeting", date: "tomorrow", start: null, end: null, location: "Room 1" }], tasks: [{ title: "Submit review", due_date: "2026-10-12" }] }, ...preferenceOverrides } = initial;
  let preferences = { language: "en", theme: "light", reducedMotion: false, defaultAiModel: "fixture-model", replyLength: "medium", speechLanguage: "auto", voiceEnabled: false, voiceAutoPlay: true, ...preferenceOverrides };
  let summaryCalls = 0; let sendCalls = 0; const calendarCalls = []; const intentContexts = []; const speechRequests = [];
  const message = { id: "fixture-1", sender: "tester@example.com", recipients: ["reader@example.com"], subject: "Fixture planning", preview: "Review the proposal.", body_plain: "Please review the proposal.", unread: false, starred: false, category: "Primary", attachments: [], ...messageOverrides };
  const messages = messageFixtures || [message];
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname === "/api/v1/auth/session") body = { authenticated: true, csrfToken: "fixture", providers: { google: true }, user: { id: "fixture", displayName: "Test Reader", email: "reader@example.com" } };
    else if (url.pathname === "/api/v1/accounts") body = { accounts: [{ id: "fixture", email: "reader@example.com", status: "CONNECTED", scopes: ["gmail.modify"] }] };
    else if (url.pathname === "/api/v1/settings") {
      if (route.request().method() === "PATCH") Object.assign(preferences, route.request().postDataJSON());
      body = { settings: preferences, allowedAiModels: ["fixture-model"] };
    } else if (url.pathname === "/api/v1/voice/capabilities") body = { available: true, transcriptionAvailable: true, synthesisAvailable: true, intentAvailable: true, maxBytes: 10485760, maxSeconds: 60, maxSpeechChars: 4096, languages: ["auto", "en-AU", "en-US", "zh-CN"] };
    else if (url.pathname === "/api/v1/voice/transcriptions") body = { text: transcriptionText };
    else if (url.pathname === "/api/v1/voice/speech") {
      speechRequests.push(route.request().postDataJSON());
      await route.fulfill({ contentType: "audio/mpeg", body: "fixture-audio" }); return;
    }
    else if (url.pathname === "/api/v1/voice/intents") {
      const request = route.request().postDataJSON();
      const transcript = request.transcript.toLowerCase();
      intentContexts.push(request.context);
      if (transcript.includes("delete") || transcript.includes("send email")) {
        await route.fulfill({ status: 422, json: { error: { code: "VOICE_UNSAFE_COMMAND", message: "Voice cannot send, delete, archive, change mailbox state, or create calendar events.", retryable: false, correlationId: "fixture" } } }); return;
      }
      if (transcript.includes("from hassan") && transcript.includes("summar")) body = { detectedLanguage: "en", action: "summarize_message", target: { mode: "search", terms: "", sender: "Hassan", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Summarise an email from Hassan", confidence: "high" };
      else if (transcript.includes("from hassan")) body = { detectedLanguage: "en", action: "search_messages", target: { mode: "search", terms: "", sender: "Hassan", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Search for emails from Hassan", confidence: "high" };
      else if (transcript.includes("summarise it") || transcript.includes("summarize it")) body = { detectedLanguage: "en", action: "summarize_message", target: { mode: "current", terms: "", sender: "", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Summarise the selected email", confidence: "high" };
      else if (transcript.includes("missing sender")) body = { detectedLanguage: "en", action: "summarize_message", target: { mode: "search", terms: "", sender: "missing@example.com", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Summarise an email from a missing sender", confidence: "high" };
      else if (transcript.includes("unclear request")) body = { detectedLanguage: "en", action: "summarize_message", target: { mode: "search", terms: "", sender: "", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Unclear mailbox request", confidence: "low" };
      else if (transcript.includes("highest priority") || transcript.includes("important")) body = { detectedLanguage: "en", action: "summarize_message", target: { mode: "search", terms: "", sender: "", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Summarise an important recent email", confidence: "high" };
      else if (transcript.includes("task")) body = { detectedLanguage: "en", action: "show_tasks", target: { mode: "none", terms: "", sender: "", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Show tasks", confidence: "high" };
      else body = { detectedLanguage: transcript.includes("总结") ? "zh-CN" : "en", action: "summarize_message", target: { mode: "current", terms: "", sender: "", subject: "", unread: null, starred: null, priority: null, newest: true }, destination: null, displayText: "Summarise the current email", confidence: "high" };
    }
    else if (url.pathname === "/api/v1/emails") body = { messages, sync: { status: "completed" } };
    else if (messages.some(item => url.pathname === `/api/v1/emails/${item.id}`)) body = messages.find(item => url.pathname === `/api/v1/emails/${item.id}`) || message;
    else if (url.pathname === "/api/v1/emails/fixture-1/reply-metadata") body = { reply_to: ["support@example.com"], subject: message.subject };
    else if (url.pathname === "/api/v1/emails/sync") body = { jobId: "fixture-job", status: "syncing" };
    else if (url.pathname.startsWith("/api/v1/emails/sync/")) body = { sync: { status: "completed" } };
    else if (url.pathname === "/api/v1/ai/classify") body = { classifications: Object.fromEntries((route.request().postDataJSON()?.messages || []).flatMap(item => {
      const found = messages.find(candidate => String(candidate.id) === String(item.id));
      return found?.priority ? [[String(item.id), { priority: found.priority, reason: "Fixture priority" }]] : [];
    })), warning: null };
    else if (url.pathname === "/api/v1/ai/summarise") { summaryCalls++; body = { summary: summaryText, bullets: summaryBullets }; }
    else if (url.pathname === "/api/v1/ai/draft-reply") body = { draft: "Thank you. I will review it." };
    else if (url.pathname === "/api/v1/ai/compose") body = { subject: "AI subject", draft: "User-reviewed generated draft." };
    else if (url.pathname === "/api/v1/ai/extract") body = extraction;
    else if (url.pathname === "/api/v1/calendar/events") { calendarCalls.push(route.request().postDataJSON()); await new Promise(resolve => setTimeout(resolve, 250)); body = { id: "event-1", created: true, htmlLink: "https://calendar.google.com/event?eid=fixture" }; }
    else if (url.pathname === "/api/v1/emails/send") { sendCalls++; body = { status: "sent" }; }
    else body = {};
    await route.fulfill({ json: body });
  });
  await page.goto("/"); await expect(page.locator("[data-email]").first()).toBeVisible();
  return { summaryCalls: () => summaryCalls, sendCalls: () => sendCalls, preferences: () => preferences, calendarCalls, intentContexts, speechRequests };
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
    const pageOverflows = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(element => {
      const box = element.getBoundingClientRect();
      return box.right > innerWidth + 1 || box.left < -1;
    }).slice(0, 8).map(element => ({ tag: element.tagName, className: element.className, right: element.getBoundingClientRect().right, width: element.getBoundingClientRect().width })));
    expect(pageOverflows).toEqual([]);
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
  const recipientTop = await page.locator("#compose-to").evaluate(element => element.getBoundingClientRect().top);
  const assistantTop = await page.getByRole("region", { name: "Revo AI writing assistant" }).evaluate(element => element.getBoundingClientRect().top);
  expect(recipientTop).toBeLessThan(assistantTop);
  await expect(page.getByRole("button", { name: "Generate draft" })).toBeVisible();
  await page.getByRole("button", { name: "Friendly" }).click();
  await expect(page.getByRole("button", { name: "Friendly" })).toHaveAttribute("aria-pressed", "true");
  await page.locator('[data-ai-instructions="compose"]').fill("Write a short update");
  await page.locator('[data-custom-draft="compose"]').click();
  await expect(page.locator("#compose-body")).toHaveValue("User-reviewed generated draft.");
  await expect(page.getByRole("button", { name: "Update draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & send" })).toBeVisible();
  expect(calls.sendCalls()).toBe(0);
  await page.locator('[data-nav="sent"]').click();
  await expect(page.getByRole("heading", { name: "Sent", exact: true })).toBeVisible();
  await expect(page.locator("[data-email]")).toHaveCount(1);
});

test("reply uses the reviewed writing panel without bypassing send confirmation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const calls = await fixture(page);
  await page.locator("[data-email]").click();
  await page.locator("[data-reply]").click();
  expect(errors).toEqual([]);
  await expect(page.getByRole("heading", { name: "Reply draft" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Revo AI writing assistant" })).toBeVisible();
  await expect(page.locator("#reply-text")).toHaveValue("Thank you. I will review it.");
  await page.getByRole("button", { name: "Concise" }).click();
  await expect(page.getByRole("button", { name: "Concise" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#reply-text")).toHaveValue("Thank you. I will review it.");
  await expect(page.locator('[data-custom-draft="reply"]')).toHaveText(/Regenerate/);
  await expect(page.getByRole("button", { name: "Review & send" })).toBeVisible();
  expect(calls.sendCalls()).toBe(0);
  expect(errors).toEqual([]);
});

test("Compose and Reply writing panels remain usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await fixture(page);
  await page.locator("[data-compose]").click();
  await expect(page.getByRole("region", { name: "Revo AI writing assistant" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  let accessibility = await new AxeBuilder({ page }).include(".composer-card").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);

  await page.locator('[data-nav="inbox"].back-button').click();
  await page.locator("[data-email]").click();
  await page.locator("[data-reply]").click();
  await expect(page.getByRole("heading", { name: "Reply draft" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  accessibility = await new AxeBuilder({ page }).include(".composer-card").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(accessibility.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
});

for (const width of [1280, 320]) {
  test(`Tasks and Calendar separate their suggestions in responsive views at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await fixture(page, { extraction: { events: [{ title: "Review meeting", date: "12 October 2026", time: "2 pm", start: "2026-10-12T14:00", end: "2026-10-12T15:00", location: "Room 1" }], tasks: [{ title: "Submit review", due_date: "2026-10-12" }] } });
    await page.locator("[data-email]").click();
    await page.locator("[data-ai-extract]").click();

    await page.locator('[data-nav="tasks"]').click();
    await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
    await expect(page.getByText("Submit review", { exact: true })).toBeVisible();
    await expect(page.getByText("Review meeting", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Remove task suggestion" }).click();
    await expect(page.getByRole("heading", { name: "No tasks at the moment" })).toBeVisible();

    await page.locator('[data-nav="calendar"]').click();
    await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();
    await expect(page.getByText("October 2026", { exact: true })).toBeVisible();
    await expect(page.locator('.calendar-day[aria-label*="12"]')).toContainText("Review meeting");
    await expect(page.getByText("Review meeting", { exact: true })).toBeVisible();
    await expect(page.getByText("Submit review", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320) expect(await page.locator(".calendar-scroll").evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    const accessibility = await new AxeBuilder({ page }).include(".calendar-shell").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(accessibility.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
    await page.getByRole("button", { name: "Remove event suggestion" }).click();
    await expect(page.getByText("No calendar events at the moment")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("voice suggestion chips follow the saved interface language", async ({ page }) => {
  await fixture(page);
  await page.locator("[data-voice]").click();
  await expect(page.locator('[data-command="Generate a reply to this email"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "为这封邮件生成回复" })).toHaveCount(0);
  await page.locator("[data-close-voice]").click();
  await page.locator('[data-nav="settings"]').click();
  await page.locator('[data-preference="language"]').selectOption("zh-CN");
  await page.getByRole("button", { name: "收件箱", exact: true }).click();
  await page.locator("[data-voice]").click();
  await expect(page.locator('[data-command="为这封邮件生成回复"]')).toBeVisible();
  await expect(page.locator('[data-command="查看我的任务"]')).toBeVisible();
  await expect(page.getByText("Starting records only after permission. Finished audio is sent to OpenAI for transcription; text selected for playback is sent for speech generation. RevoMail does not persist recordings, transcripts, or generated audio. The playback voice is AI-generated.", { exact: false })).toBeVisible();
  await expect(page.getByText("Voice input is off. Choosing Start recording will save your consent, then request system microphone permission. You can always type instead.")).toBeVisible();
});

test("voice accepts Chinese input but keeps demo guidance and output in English", async ({ page }) => {
  const calls = await fixture(page, { voiceAutoPlay: false });
  await page.locator("[data-email]").click();
  await page.locator("[data-voice]").click();
  await expect(page.getByText("Use voice commands to search, open, summarise, draft, extract, or navigate. Every command is reviewed before it runs.")).toBeVisible();
  await expect(page.getByText("Review or type a command", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("or Chinese");
  await expect(page.getByText("Voice input is off. Choosing Start recording will save your consent, then request system microphone permission. You can always type instead.")).toBeVisible();

  await page.locator("#voice-transcript").fill("总结这封邮件");
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".voice-review")).toContainText("Summarise the current email");
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".voice-result-copy")).toHaveText("Review the proposal.");
  await page.locator("[data-speak]").click();
  await expect.poll(() => calls.speechRequests.at(-1)).toEqual({ text: "Review the proposal.", language: "en" });
});

test("show tasks does not report calendar events as tasks", async ({ page }) => {
  await fixture(page, { extraction: { events: [{ title: "Calendar-only meeting", start: "2026-10-12T14:00" }], tasks: [] } });
  await page.locator("[data-email]").click();
  await page.locator("[data-ai-extract]").click();
  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await page.locator("[data-voice]").click();
  await page.locator("#voice-transcript").fill("Show my tasks");
  await page.locator("[data-run-command]").click();
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".collection-empty")).toContainText("No tasks at the moment");
  await expect(page.locator(".voice-result-copy")).toHaveText("There are no tasks at the moment.");
  await expect(page.locator(".voice-result-copy")).not.toContainText("Calendar-only meeting");
});

test("formatted email hides preheaders and does not stack long words vertically", async ({ page }) => {
  await page.context().route("https://example.test/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>External message</title>" }));
  await fixture(page, { message: { body_html: '<div class="mcnPreviewText">Fender</div><span id="preheader">Facebook</span><table><tbody><tr><td id="narrow" style="width:1px">DomesticStudentResources</td><td><a id="message-link" href="https://example.test/message">Visible message</a></td></tr></tbody></table><a href="https://example.test/image"><img id="brand" src="https://invalid.example/logo.png" alt="Fender" style="font-size:16px;color:red"></a>' } });
  await page.locator("[data-email]").click();
  const frame = page.frameLocator("[data-message-frame]");

  await expect(frame.locator(".mcnPreviewText")).toBeHidden();
  await expect(frame.locator("#preheader")).toBeHidden();
  await expect(frame.getByText("Visible message", { exact: true })).toBeVisible();
  const layout = await frame.locator("#narrow").evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height, wordBreak: style.wordBreak, overflowWrap: style.overflowWrap };
  });
  expect(layout.wordBreak).toBe("normal");
  expect(layout.overflowWrap).toBe("normal");
  expect(layout.width).toBeGreaterThan(80);
  expect(layout.height).toBeLessThan(80);
  await expect(frame.locator("#brand")).toHaveCSS("font-size", "0px");
  await expect(frame.locator("#brand")).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  await expect(page.locator("[data-message-frame]")).toHaveAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");

  const popupPromise = page.waitForEvent("popup");
  await frame.locator("#message-link").click();
  const popup = await popupPromise;
  await expect.poll(() => popup.url()).toBe("https://example.test/message");
  await popup.close();
});

test("Key details keeps extracted copy readable in the narrow insight rail", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page);
  await page.locator("[data-email]").click();
  await page.locator("[data-ai-extract]").click();

  const item = page.locator(".ai-rail .extraction-item").first();
  const content = item.locator(":scope > span").first();
  const title = item.locator(".extraction-title");
  const metadata = item.locator(".extraction-meta");
  const actions = item.locator(".extraction-actions");
  const [itemStyle, contentBox, titleBox, metadataBox, actionsBox] = await Promise.all([
    item.evaluate(element => ({ flexDirection: getComputedStyle(element).flexDirection, alignItems: getComputedStyle(element).alignItems })),
    content.boundingBox(),
    title.boundingBox(),
    metadata.boundingBox(),
    actions.boundingBox()
  ]);

  expect(itemStyle).toEqual({ flexDirection: "column", alignItems: "flex-start" });
  expect(contentBox.width).toBeGreaterThan(220);
  expect(metadataBox.y).toBeGreaterThan(titleBox.y);
  expect(actionsBox.y).toBeGreaterThan(contentBox.y);
  await expect(page.getByRole("button", { name: "Add to Google Calendar" })).toBeVisible();
});

for (const width of [1280, 320]) {
  test(`settings, keyboard voice review, and accessibility at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const calls = await fixture(page, { summaryBullets: ["Repeated key point must stay in the email Summary card."] });
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
    const inputPane = await page.locator(".voice-input-pane").boundingBox();
    const outputPane = await page.locator(".voice-output-pane").boundingBox();
    expect(inputPane).not.toBeNull(); expect(outputPane).not.toBeNull();
    if (width > 760) {
      expect(outputPane.x).toBeGreaterThan(inputPane.x + inputPane.width);
      expect(Math.abs(outputPane.y - inputPane.y)).toBeLessThan(4);
      const privacyBox = await page.locator(".privacy-note").boundingBox();
      const outputHeadingBox = await page.locator("#voice-output-title").boundingBox();
      const privacyPadding = await page.locator(".privacy-note").evaluate(element => parseFloat(getComputedStyle(element).paddingLeft));
      expect(Math.abs(privacyBox.x + privacyPadding - outputHeadingBox.x)).toBeLessThan(3);
    } else {
      expect(outputPane.y).toBeGreaterThan(inputPane.y + inputPane.height);
    }
    const transcriptBox = await page.locator("#voice-transcript").boundingBox();
    expect(transcriptBox.x - inputPane.x).toBeGreaterThanOrEqual(width > 760 ? 5 : 0);
    expect(await page.locator(".voice-modal").evaluate(element => {
      const box = element.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth;
    })).toBe(true);
    await page.locator("#voice-transcript").fill("delete every email");
    await page.locator("[data-run-command]").click();
    await expect(page.getByRole("alert").filter({ hasText: "Voice cannot send" })).toBeVisible();
    expect(calls.summaryCalls()).toBe(0);
    await page.locator("#voice-transcript").fill("Help me summarize this email.");
    await page.waitForTimeout(900); // Let the mailbox fixture's sync completion update the app.
    await expect(page.locator("#voice-transcript")).toHaveValue("Help me summarize this email.");
    expect(calls.summaryCalls()).toBe(0);
    await page.locator("[data-run-command]").click();
    await expect(page.getByRole("heading", { name: "Command preview" })).toBeVisible();
    expect(calls.summaryCalls()).toBe(0);
    await page.locator("[data-run-command]").click();
    await expect.poll(calls.summaryCalls).toBe(1);
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
    await expect(page.locator(".voice-result-copy")).toContainText("Review the proposal.");
    await expect(page.locator(".voice-result-copy")).not.toContainText("Repeated key point");
    await page.screenshot({ path: `build/module7-browser-results/voice-split-${width}.png`, fullPage: true });
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

test("global voice review resolves ranked candidates and requires target confirmation", async ({ page }) => {
  const calls = await fixture(page, { messages: [
    { id: "low-new", sender: "news@example.com", recipients: ["reader@example.com"], subject: "Newest low", preview: "News", body_plain: "News", unread: false, starred: false, category: "Primary", attachments: [], priority: "low", receivedAt: "2026-10-06T04:00:00Z" },
    { id: "high-old", sender: "lead@example.com", recipients: ["reader@example.com"], subject: "Important action", preview: "Please review", body_plain: "Please review", unread: true, starred: false, category: "Primary", attachments: [], priority: "high", receivedAt: "2026-10-05T04:00:00Z" },
  ] });
  await page.locator("[data-voice]").click();
  await expect(page.getByText("Context: whole mailbox. Name or describe an email in your command.")).toBeVisible();
  await page.locator("#voice-transcript").fill("Summarise my most important recent email");
  await page.locator("[data-run-command]").click();
  await expect(page.locator("[data-voice-candidate]")).toHaveCount(2);
  await expect(page.locator(".voice-candidates strong").first()).toContainText("Important action");
  expect(calls.summaryCalls()).toBe(0);
  await page.locator("[data-voice-candidate]").first().check();
  await page.locator("[data-run-command]").click();
  await expect.poll(calls.summaryCalls).toBe(1);
  await expect(page.getByRole("heading", { name: "Result ready" })).toBeVisible();
});

test("a reviewed search target remains available to a recorded follow-up command", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  const hassan = { id: "hassan-1", sender: "Hassan Saadatmand <hassan.saadatmand@monash.edu>", recipients: ["reader@example.com"], subject: "Test", preview: "Follow-up context", body_plain: "Please review this email.", unread: false, starred: false, category: "Primary", attachments: [], receivedAt: "2026-10-05T01:37:00Z" };
  const calls = await fixture(page, { messages: [hassan], voiceEnabled: true, voiceAutoPlay: false, transcriptionText: "Summarise it" });

  await page.locator("[data-voice]").click();
  await page.locator("#voice-transcript").fill("Help me find the email from Hassan");
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".voice-selected")).toContainText("Test");
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".voice-follow-up")).toContainText("Follow-up target: Test");

  await page.locator("[data-record]").click();
  await expect(page.locator("[data-voice-status]")).toHaveText("Microphone on — recording");
  await page.waitForTimeout(250);
  await page.locator("[data-finish-recording]").click();
  await expect(page.locator("#voice-transcript")).toHaveValue("Summarise it");
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".voice-selected")).toContainText("Test");
  expect(calls.intentContexts.at(-1)).toMatchObject({ followUpMessageId: "hassan-1" });
  await page.locator("[data-run-command]").click();
  await expect.poll(calls.summaryCalls).toBe(1);
  await expect(page.locator(".voice-result-copy")).toHaveText("Review the proposal.");
  await context.close();
});

test("whole-mailbox current-email wording asks the user to specify a target", async ({ page }) => {
  await fixture(page);
  await page.locator("[data-voice]").click();
  await page.locator("#voice-transcript").fill("Help me summarize this email.");
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("Please specify which email you want, for example by sender, subject, or recency.");
  await expect(page.getByRole("heading", { name: "Command preview" })).toHaveCount(0);
  await expect(page.locator("[data-run-command]")).toHaveText("Review command");
  await expect(page.locator("#voice-transcript")).toBeEditable();
});

test("broad, unmatched and low-confidence mailbox commands never leave a dead confirmation", async ({ page }) => {
  await fixture(page);
  await page.locator("[data-voice]").click();
  await page.locator("#voice-transcript").fill("Help me summarize the highest priority email.");
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("heading", { name: "Command preview" })).toBeVisible();
  await expect(page.locator(".voice-selected")).toContainText("Fixture planning");

  await page.locator("#voice-transcript").fill("Summarise the email from the missing sender");
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("No matching emails were found. Please specify a sender, subject, unread or starred status, or recency.");
  await expect(page.getByRole("heading", { name: "Command preview" })).toHaveCount(0);
  await expect(page.locator("[data-run-command]")).toHaveText("Review command");

  await page.locator("#voice-transcript").fill("Unclear request");
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("I couldn't identify a specific command. Please name the action and describe the email you want.");
  await expect(page.getByRole("heading", { name: "Command preview" })).toHaveCount(0);
  await expect(page.locator("#voice-transcript")).toBeEditable();
});

test("voice playback updates preserve the output scroll position", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await fixture(page, { voiceEnabled: true, voiceAutoPlay: false, summaryText: "Review the proposal. ".repeat(80) });
  await page.locator("[data-email]").click();
  await page.locator("[data-voice]").click();
  await page.locator("#voice-transcript").fill("Help me summarize this email.");
  await page.locator("[data-run-command]").click();
  await page.locator("[data-run-command]").click();
  await expect(page.locator(".voice-result-copy")).toBeVisible();
  const pane = page.locator(".voice-output-pane");
  await expect.poll(() => pane.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await pane.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const before = await pane.evaluate(element => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.locator("[data-speak]").click();
  await page.waitForTimeout(300);
  expect(await pane.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
});

test("real browser media capture enables consent, pauses, releases and requires two-step review", async ({ browser }) => {
  const context = await browser.newContext({ permissions: ["microphone"] });
  const page = await context.newPage();
  const calls = await fixture(page, { voiceEnabled: false, voiceAutoPlay: false });
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
  await expect(page.locator("[data-record]")).toBeEnabled();
  await page.locator("[data-record]").click();
  await expect.poll(() => calls.preferences().voiceEnabled).toBe(true);
  await expect.poll(async () => ({ status: await page.locator("[data-voice-status]").textContent(), errors: await page.locator('[role="dialog"] [role="alert"]').allTextContents() })).toEqual({ status: "Microphone on — recording", errors: [] });
  await expect(page.locator("[data-voice-status]")).toHaveText("Microphone on — recording");
  await page.locator("[data-pause]").click();
  await expect(page.locator("[data-voice-status]")).toHaveText("Paused — microphone muted; capture session remains open");
  const pausedTime = await page.locator(".microphone-status time").textContent();
  expect(pausedTime).toMatch(/^\d{2}:\d{2}$/);
  await page.waitForTimeout(1100);
  await expect(page.locator(".microphone-status time")).toHaveText(pausedTime);
  expect(await page.locator(".microphone-status time").evaluate(element => getComputedStyle(element).whiteSpace)).toBe("nowrap");
  const pausedButtons = await Promise.all(["[data-pause]", "[data-finish-recording]", "[data-cancel-recording]", "[data-restart-recording]"].map(selector => page.locator(selector).boundingBox()));
  expect(Math.max(...pausedButtons.map(box => box.width)) - Math.min(...pausedButtons.map(box => box.width))).toBeLessThan(2);
  await page.locator("[data-pause]").click();
  await page.waitForTimeout(500);
  await page.locator("[data-finish-recording]").click();
  await expect(page.locator("#voice-transcript")).toHaveValue("Show my tasks");
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("heading", { name: "Command preview" })).toBeVisible();
  await page.locator("[data-run-command]").click();
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(page.getByText("Project Meeting", { exact: true })).toHaveCount(0);
  await context.close();
});
