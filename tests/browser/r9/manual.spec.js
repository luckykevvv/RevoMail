import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BODY = "Please review the proposal by 2026-11-06. Project meeting on 2026-11-05 at 10:00 in Room 2.";

test.afterEach(async ({ page }) => {
  // Clean up optional connections even if a browser assertion fails mid-flow.
  const session = await page.request.get("/api/v1/auth/session").then(response => response.json());
  if (!session.authenticated) return;
  const { accounts } = await page.request.get("/api/v1/accounts").then(response => response.json());
  for (const account of accounts) await page.request.delete(`/api/v1/accounts/${encodeURIComponent(account.id)}`, { headers: { "x-csrf-token": session.csrfToken } });
});

async function openManual(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Gmail is not connected" })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Analyse Text" }).click();
  await expect(page.getByRole("heading", { name: "Analyse Text", exact: true })).toBeVisible();
  return errors;
}

test("Outlook text uses real manual APIs for all four operations without Gmail", async ({ page }) => {
  const mailboxRequests = [];
  page.on("request", request => { if (/\/api\/v1\/(emails|calendar)/.test(request.url())) mailboxRequests.push(request.url()); });
  const errors = await openManual(page);
  await page.getByLabel("Subject (optional)").fill("Project review");
  await page.getByLabel("Sender (optional)").fill("tutor@outlook.example");
  await page.getByLabel("Email text", { exact: true }).fill(BODY);
  const request = page.waitForRequest(request => request.url().endsWith("/manual/summarise"));
  await page.getByRole("button", { name: "Summarise", exact: true }).click();
  expect((await request).postDataJSON()).not.toHaveProperty("message_id");
  await expect(page.locator("#manual-summary")).toContainText("Review the proposal");
  await page.getByRole("button", { name: "Classify priority" }).click();
  await expect(page.getByText("Review requested by Friday")).toBeVisible();
  await page.getByRole("button", { name: "Extract tasks / events" }).click();
  await expect(page.getByLabel("Task suggestion 1")).toContainText("Review proposal");
  await page.getByLabel("Event suggestion 1").fill("Reviewed event: confirm the date with organiser");
  await page.getByRole("button", { name: "Generate reply draft" }).click();
  await expect(page.getByRole("textbox", { name: "Reply draft", exact: true })).toHaveValue(/Thank you/);
  await page.getByRole("textbox", { name: "Reply draft", exact: true }).fill("My reviewed reply.");
  await page.getByLabel("Reply tone").selectOption("friendly");
  await expect(page.locator("[data-manual-draft-status]")).toContainText("Your edited draft is preserved");
  await expect(page.getByRole("textbox", { name: "Reply draft", exact: true })).toHaveValue("My reviewed reply.");
  await page.getByLabel("Reply instructions (optional)").fill("Keep it brief");
  await expect(page.getByRole("button", { name: "Regenerate reply draft" })).toBeVisible();
  await page.getByRole("button", { name: "Regenerate reply draft" }).click();
  await expect(page.locator("[data-manual-draft-status]")).toBeHidden();
  await page.getByRole("textbox", { name: "Reply draft", exact: true }).fill("My reviewed reply.");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy reply draft" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("My reviewed reply.");
  expect(mailboxRequests).toEqual([]); expect(errors).toEqual([]);
  await expect(page.locator("[data-send], [data-confirm-calendar]")).toHaveCount(0);
});

test("real txt and MIME eml import require a separate AI action", async ({ page }) => {
  await openManual(page);
  let analyses = 0;
  page.on("request", request => { if (/\/manual\/(summarise|extract|classify|draft-reply)$/.test(request.url())) analyses++; });
  await expect(page.locator("[data-manual-file-name]")).toHaveText("No file selected");
  await expect(page.locator("[data-manual-file]")).toBeHidden();
  await page.getByRole("button", { name: "Choose file", exact: true }).focus();
  const chooserReady = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooserReady).setFiles({ name: "fixture.txt", mimeType: "text/plain", buffer: Buffer.from(BODY) });
  await expect(page.getByLabel("Email text", { exact: true })).toHaveValue(BODY);
  await expect(page.locator("[data-manual-file-name]")).toHaveText("fixture.txt");
  expect(analyses).toBe(0);
  const eml = "Subject: University review\r\nFrom: Fixture Tutor <tutor@university.example>\r\nDate: Sun, 01 Nov 2026 10:00:00 +1100\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=fixture\r\n\r\n--fixture\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n" + BODY + "\r\n--fixture\r\nContent-Type: text/html\r\n\r\n<p>Alternative</p>\r\n--fixture--\r\n";
  await page.getByLabel("Import .txt or .eml (up to 1 MiB)").setInputFiles({ name: "fixture.eml", mimeType: "message/rfc822", buffer: Buffer.from(eml) });
  await expect(page.getByLabel("Subject (optional)")).toHaveValue("University review");
  await expect(page.locator("[data-manual-file-name]")).toHaveText("fixture.eml");
  expect(analyses).toBe(0);
  await page.getByRole("button", { name: "Summarise", exact: true }).click();
  await expect(page.locator("#manual-summary")).toBeVisible();
});

test("validation, safe failure, retry, cancellation and memory lifecycle", async ({ page }) => {
  await openManual(page);
  await page.getByRole("button", { name: "Summarise", exact: true }).click();
  await expect(page.locator(".manual-panel [role=alert]")).toContainText("Paste email");
  await page.getByLabel("Import .txt or .eml (up to 1 MiB)").setInputFiles({ name: "fixture.pdf", mimeType: "application/pdf", buffer: Buffer.from("not supported") });
  await expect(page.locator(".manual-panel [role=alert]")).toContainText("Only .txt and .eml");
  await page.getByLabel("Email text", { exact: true }).fill("R9_FAIL_ONCE");
  await page.getByRole("button", { name: "Summarise", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry analysis" })).toBeVisible();
  await expect(page.locator(".manual-panel [role=alert]")).not.toContainText("fixture-private");
  await page.getByRole("button", { name: "Retry analysis" }).click();
  await expect(page.locator("#manual-summary")).toBeVisible();
  await page.getByLabel("Email text", { exact: true }).fill(BODY + " R9_DELAY");
  await page.getByRole("button", { name: "Summarise", exact: true }).click();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByText(/^Request cancelled/)).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator("#manual-summary")).toHaveCount(0);
  await page.getByRole("navigation").getByRole("button", { name: "Inbox", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Analyse Text" }).click();
  await expect(page.getByLabel("Email text", { exact: true })).toHaveValue(BODY + " R9_DELAY");
  await page.reload();
  await page.getByRole("navigation").getByRole("button", { name: "Analyse Text" }).click();
  await expect(page.getByLabel("Email text", { exact: true })).toHaveValue("");
});

for (const reason of ["sign-out", "session expiry"]) test(`manual content clears after ${reason}`, async ({ page }) => {
  await openManual(page);
  await page.getByLabel("Email text", { exact: true }).fill(BODY);
  if (reason === "sign-out") await page.getByRole("button", { name: "Sign out", exact: true }).click();
  else {
    await page.evaluate(async () => {
      const session = await fetch("/api/v1/auth/session").then(response => response.json());
      await fetch("/api/v1/auth/logout", { method: "POST", headers: { "x-csrf-token": session.csrfToken } });
    });
    await page.getByRole("button", { name: "Summarise", exact: true }).click();
  }
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Analyse Text" }).click();
  await expect(page.getByLabel("Email text", { exact: true })).toHaveValue("");
});

test("clipboard failure exposes selectable reviewed text", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("Fixture clipboard unavailable"); } } }));
  await openManual(page);
  await page.getByLabel("Email text", { exact: true }).fill(BODY);
  await page.getByRole("button", { name: "Generate reply draft" }).click();
  await expect(page.getByRole("textbox", { name: "Reply draft", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy reply draft" }).click();
  await expect(page.getByLabel("Text to copy manually")).toBeFocused();
  await expect(page.getByLabel("Text to copy manually")).toHaveValue(/Thank you/);
});

test("optional Gmail/Calendar grants and disconnect retain sign-in", async ({ page }) => {
  await openManual(page);
  await page.getByRole("navigation").getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Connect Gmail", exact: true }).click();
  await expect(page.getByRole("button", { name: "Enable Calendar" })).toBeVisible();
  await page.getByRole("button", { name: "Enable Calendar" }).click();
  await expect(page.getByRole("button", { name: "Enable Calendar" })).toHaveCount(0);
  // Reconnecting Gmail may return no Calendar scope after an older grant has
  // expired/revoked. Successful Gmail consent must still save and start syncing.
  await page.getByRole("button", { name: "Reconnect Gmail", exact: true }).click();
  await expect(page.locator(".account-connection-notice")).toContainText("Gmail authorisation saved");
  await expect(page.getByRole("button", { name: "Enable Calendar" })).toBeVisible();
  await expect.poll(() => page.request.get("/api/v1/emails").then(response => response.json()).then(result => result.sync.status)).toBe("idle");
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Gmail", exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "Analyse Text" }).click();
  await expect(page.getByLabel("Email text", { exact: true })).toBeVisible();
});

for (const width of [1280, 320]) for (const theme of ["light", "dark"]) {
  test(`keyboard and axe at ${width}px in ${theme} theme`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = await openManual(page);
    // Use the real preference API, then reload to verify persisted theme integration.
    await page.evaluate(async theme => {
      const session = await fetch("/api/v1/auth/session").then(response => response.json());
      await fetch("/api/v1/settings", { method: "PATCH", headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken }, body: JSON.stringify({ theme }) });
    }, theme);
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "Analyse Text" }).click();
    await page.getByLabel("Email text", { exact: true }).focus();
    await page.keyboard.insertText(BODY);
    await page.getByRole("button", { name: "Summarise", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#manual-summary")).toBeVisible();
    await expect(page.locator("#manual-results-title")).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320) {
      expect(await page.locator(".sidebar").evaluate(sidebar => {
        const bounds = sidebar.getBoundingClientRect();
        return [...sidebar.querySelectorAll(".nav-item")].filter(item => getComputedStyle(item).display !== "none").every(item => item.getBoundingClientRect().bottom <= bounds.bottom);
      })).toBe(true);
      await expect(page.getByRole("navigation").getByRole("button", { name: "Starred", exact: true })).toBeVisible();
    }
    const violations = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(violations.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => ({ target: node.target, failure: node.failureSummary })) }))).toEqual([]);
    expect(errors).toEqual([]);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `build/r9-${width}-${theme}.png`, fullPage: true });
  });
}
