import "./style.css";
import { DEFAULT_PREFERENCES, PreferenceWriter } from "./preferences.js";
import { VoiceController } from "./voice/controller.js";
import { validateCommand } from "./voice/commands.js";
import { preferencesView, voiceView } from "./module7-views.js";
import { captureFocus, restoreFocus, syncDialog } from "./accessibility.js";
import { translate, translateUI } from "./i18n.js";
import { messageFrameDocument } from "./email-html.js";
import { calendarPayload, eventDraftFromExtraction, formatMailTime, formatFullMailTime, replySubject, applyClassifications, applyMailboxPage, formatLocalDateTime, LatestRequestCoordinator, mailboxContentState, matchesMailboxCategory, selectAfterMailboxRefresh } from "./mailbox-state.js";
import {
  AlignLeft,
  Archive,
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  CalendarDays,
  CalendarPlus,
  Captions,
  Check,
  CircleCheck,
  Clock3,
  Cpu,
  createIcons,
  Ellipsis,
  File as FileIcon,
  FileCheck2,
  Forward,
  Image,
  Inbox,
  Languages,
  ListFilter,
  LogOut,
  Mail,
  MapPin,
  Mic,
  MicOff,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  ScanText,
  Search,
  SearchX,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  SquareCheckBig,
  SquarePen,
  Star,
  Sun,
  SunMoon,
  Trash2,
  X
} from "lucide";

const demoIcons = {
  AlignLeft,
  Archive,
  ArrowLeft,
  ArrowRight,
  AudioWaveform,
  CalendarDays,
  CalendarPlus,
  Captions,
  Check,
  CircleCheck,
  Clock3,
  Cpu,
  Ellipsis,
  File: FileIcon,
  FileCheck2,
  Forward,
  Image,
  Inbox,
  Languages,
  ListFilter,
  LogOut,
  Mail,
  MapPin,
  Mic,
  MicOff,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  ReplyAll,
  ScanText,
  Search,
  SearchX,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Sparkles,
  SquareCheckBig,
  SquarePen,
  Star,
  Sun,
  SunMoon,
  Trash2,
  X
};

const app = document.querySelector("#app");

let emails = [];

const state = {
  authenticated: null,
  user: null,
  csrfToken: "",
  providers: { google: false },
  accounts: [],
  authError: "",
  accountBusy: "",
  view: "inbox",
  selectedEmail: null,
  category: "Primary",
  priority: "All",
  classifying: false,
  classifyNote: "",
  search: "",
  preferences: { ...DEFAULT_PREFERENCES },
  settingsStatus: "loading", settingsError: false, allowedAiModels: [],
  capabilities: null,
  voice: { status: "idle", text: "", error: "", targetId: null, targetSubject: "" },
  compose: { to: "", subject: "", body: "" },
  toastError: false,
  voiceOpen: false,
  replyVersion: 0,
  calendarDraft: null, calendarError: "", calendarSaving: false, addedEvents: {}, calendarAttempts: {},
  sent: [], sentLoading: false, sentError: "", sentCursor: null,
  aiInstructions: { reply: "", compose: "" }, composeLoading: false,
  eventAdded: false,
  assignmentAdded: false,
  toast: "",
  emailsLoading: false,
  emailsError: "",
  sync: null,
  nextPageToken: null,
  bodyMode: "formatted",
  sendConfirmation: null,
  sendBusy: false,
  aiSummary: null,
  aiSummaryLoading: false,
  aiExtraction: null,
  aiExtractionLoading: false,
  aiDraft: "",
  aiDraftLoading: false,
  aiDraftTone: "professional"
};

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

async function api(path, options = {}) {
  const headers = { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(state.csrfToken ? { "x-csrf-token": state.csrfToken } : {}), ...options.headers };
  const response = await fetch(path, { credentials: "same-origin", ...options, headers });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "The request could not be completed.");
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload;
}

const requestCoordinator = new LatestRequestCoordinator();

function beginRequest(key) {
  return requestCoordinator.begin(key);
}

function finishRequest(key, controller) {
  return requestCoordinator.finish(key, controller);
}

function cancelRequest(key) {
  requestCoordinator.cancel(key);
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

const navItems = [
  ["inbox", "Inbox", "inbox"],
  ["starred", "Starred", "star"],
  ["drafts", "Drafts", "file"],
  ["sent", "Sent", "send"],
  ["tasks", "Tasks", "square-check-big"],
  ["calendar", "Calendar", "calendar-days"],
  ["settings", "Settings", "settings"]
];


function icon(name, className = "") {
  return `<i data-lucide="${name}" class="${className}" aria-hidden="true"></i>`;
}

function logo() {
  return `<button class="brand" data-nav="inbox" aria-label="Go to inbox">
    <span class="brand-mark">${icon("mail")}</span>
    <span>RevoMail</span>
  </button>`;
}

function renderLogin() {
  return `<main class="login-page">
    <section class="login-story" aria-label="Product introduction">
      <div class="ambient-orb orb-one"></div><div class="ambient-orb orb-two"></div>
      <div class="story-content">
        <div class="story-kicker">${icon("sparkles")} AI email, under your control</div>
        <h1>Turn your inbox into<br /><span>forward motion.</span></h1>
        <p>RevoMail summarises, drafts and extracts tasks while keeping you in the loop.</p>
        <div class="mini-mail-card">
          <div class="mini-mail-top"><span class="avatar avatar-sm">PS</span><div><strong>Project Meeting Tomorrow</strong><small>Prof. Smith · 10:30 AM</small></div></div>
          <div class="mini-summary">${icon("sparkles")} <span><strong>3 key details found</strong><small>10:00 AM · Room 302 · Progress update</small></span></div>
        </div>
      </div>
      <span class="story-foot">Accessible by design · Human reviewed</span>
    </section>
    <section class="login-panel">
      <div class="login-card">
        ${logo()}
        <div class="login-heading"><p>Welcome to your calmer inbox</p><h2>Continue to RevoMail</h2></div>
        ${state.authError ? `<div class="auth-alert" role="alert">${escapeHtml(state.authError)} <button class="text-button" data-clear-auth-error>Dismiss</button></div>` : ""}
        <div class="oauth-stack">
          <button class="oauth google" data-login ${state.providers.google ? "" : "disabled"}><span class="provider provider-google">G</span>Continue with Google</button>
        </div>
        ${!state.providers.google ? '<p class="provider-note">Google sign-in is not configured on this environment.</p>' : ""}
        <p class="secure-note">${icon("shield-check")} OAuth 2.0 · RevoMail never sees your password</p>
        <p class="legal">By continuing, you agree to the Terms and Privacy Policy.</p>
      </div>
    </section>
  </main>`;
}

function sidebar() {
  const name = escapeHtml(state.user?.displayName || "RevoMail User");
  const email = escapeHtml(state.user?.email || "");
  const initials = name.split(/\s/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const unreadCount = emails.filter((message) => message.unread).length;
  return `<aside class="sidebar">
    <div class="sidebar-top">${logo()}</div>
    <nav class="nav-list" aria-label="Mailbox navigation">
      ${navItems.map(([view, label, navIcon]) => `<button class="nav-item ${state.view === view ? "active" : ""}" data-nav="${view}" aria-label="${label}">${icon(navIcon)}<span>${label}</span>${view === "inbox" && unreadCount ? `<b class="nav-count">${unreadCount}</b>` : ""}</button>`).join("")}
    </nav>
    <div class="account-card">
      <span class="avatar">${initials}</span>
      <span class="account-copy" data-user-content><strong>${name}</strong><small>${email}</small></span>
      <button class="icon-button" data-logout title="Sign out" aria-label="Sign out">${icon("log-out")}</button>
    </div>
  </aside>`;
}

function shell(content) {
  return `<a class="skip-link" href="#workspace">Skip to main content</a><main class="app-shell">${sidebar()}<section class="workspace" id="workspace" tabindex="-1" data-workspace>${content}</section></main><div data-overlays></div>`;
}

function inboxView() {
  const firstName = escapeHtml(state.user?.displayName?.split(/\s+/)[0] || "there");
  const visible = emails.filter((email) => {
    const matchesCategory = matchesMailboxCategory(email, state.category);
    const matchesPriority = state.priority === "All" || email.priority === state.priority;
    const haystack = `${email.sender} ${email.subject} ${email.preview}`.toLowerCase();
    return matchesCategory && matchesPriority && haystack.includes(state.search.toLowerCase());
  });
  const contentState = mailboxContentState({
    error: state.emailsError,
    loading: state.emailsLoading,
    messageCount: emails.length,
    visibleCount: visible.length,
    syncStatus: state.sync?.status
  });
  const content = {
    error: `<div class="empty-state" role="alert"><h3>Mailbox unavailable</h3><p>${escapeHtml(state.emailsError)}</p><button class="secondary-button" data-retry-mailbox>Retry</button></div>`,
    loading: '<div class="empty-state" role="status" aria-live="polite"><h3>Loading your inbox…</h3><p>Fetching messages from your connected account.</p></div>',
    syncing: `<div class="empty-state" role="status" aria-live="polite">${icon("refresh-cw")}<h3>Synchronising your inbox…</h3><p>Fetching messages from your connected account.</p></div>`,
    "filtered-empty": `<div class="empty-state">${icon("search-x")}<h3>No emails found</h3><p>Try a different search or category.</p></div>`,
    empty: `<div class="empty-state">${icon("inbox")}<h3>Your inbox is empty</h3><p>No messages were returned by your connected account.</p></div>`
  };
  return `<header class="page-header">
    <div><span class="eyebrow">Good morning, ${firstName}</span><h1>Inbox</h1><p>AI has highlighted what needs your attention.</p></div>
    <button class="primary-button compose-button" data-compose>${icon("square-pen")} Compose</button>
  </header>
  <section class="inbox-toolbar">
    <label class="search-box">${icon("search")}<input id="search" type="search" placeholder="Search emails…" value="${escapeHtml(state.search)}" aria-label="Search emails" /><kbd>⌘ K</kbd></label>

  </section>
  <div class="category-tabs" role="group" aria-label="Email categories">
    ${["All", "Primary", "Social", "Promotions"].map((category) => `<button class="tab ${state.category === category ? "active" : ""}" aria-pressed="${state.category === category}" data-category="${category}">${category}</button>`).join("")}
  </div>
  ${priorityFilter()}
  <section class="mail-panel">
    <div class="mail-panel-heading"><span>${state.emailsLoading && !emails.length ? "Loading conversations" : `${visible.length} conversations`}${state.sync?.status === "syncing" ? " · Synchronising…" : ""}${priorityStatus()}</span></div>
    <div class="email-list">
      ${contentState === "messages" ? visible.map(emailRow).join("") : content[contentState]}
    </div>
    ${state.nextPageToken ? `<div class="mail-panel-heading"><button class="text-button" data-load-more ${state.emailsLoading ? "disabled" : ""}>${state.emailsLoading ? "Loading…" : "Load more"}</button></div>` : ""}
  </section>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`;
}

const priorityMeta = {
  high: { label: "High", hint: "Needs an urgent reply or action" },
  medium: { label: "Medium", hint: "Updates and routine communication" },
  low: { label: "Low", hint: "Advertisements and low-relevance mail" }
};

function priorityBadge(email) {
  const meta = priorityMeta[email.priority];
  if (!meta) return "";
  const reason = email.priorityReason ? `${meta.hint}. AI reason: ${email.priorityReason}` : meta.hint;
  return `<em class="priority-badge priority-${email.priority}" title="${escapeHtml(reason)}">${meta.label}</em>`;
}

function priorityFilter() {
  const counts = { High: 0, Medium: 0, Low: 0 };
  emails.forEach((email) => { if (priorityMeta[email.priority]) counts[priorityMeta[email.priority].label] += 1; });
  const chips = [["All", "All priorities", ""], ...Object.entries(priorityMeta).map(([key, meta]) => [key, `${meta.label} priority`, meta.hint])];
  return `<div class="priority-filter" role="group" aria-label="Filter by AI priority">
    ${chips.map(([key, label, hint]) => `<button class="priority-chip ${key !== "All" ? `priority-${key}` : ""} ${state.priority === key ? "active" : ""}" data-priority="${key}" aria-pressed="${state.priority === key}" ${hint ? `title="${escapeHtml(hint)}"` : ""}>${label}${key !== "All" ? `<span>${counts[priorityMeta[key].label]}</span>` : ""}</button>`).join("")}
  </div>`;
}

function priorityStatus() {
  if (state.classifying) return ' · <span class="priority-status" role="status">Classifying priority…</span>';
  if (state.classifyNote) return ` · <span class="priority-status warn" role="status">${escapeHtml(state.classifyNote)}</span>`;
  return "";
}

function emailRow(email) {
  const receivedAt = email.receivedAt || email.time || email.date || "";
  return `<article class="email-row ${email.unread ? "unread" : "read"}" data-email="${email.id}" tabindex="0">
    <span aria-hidden="true"></span>
    <button class="star-button ${email.starred ? "starred" : ""}" data-star="${email.id}" aria-label="Star email">${icon("star")}</button>
    <span class="avatar avatar-sm avatar-soft">${escapeHtml(String(email.sender || "?").split(/\s|@/).slice(0, 2).map((part) => part[0]).join("").toUpperCase())}</span>
    <div class="email-sender" data-user-content><span class="sr-only">${email.unread ? "Unread. " : "Read. "}</span>${escapeHtml(email.sender)}</div>
    <div class="email-content" data-user-content>${priorityBadge(email)}<strong>${escapeHtml(email.subject)}</strong><span>${escapeHtml(email.preview)}</span></div>
    <time datetime="${escapeHtml(receivedAt)}" title="${escapeHtml(formatLocalDateTime(receivedAt))}">${escapeHtml(formatMailTime(receivedAt, { locale: state.preferences.language }))}</time>
    ${email.unread ? '<span class="unread-dot" role="img" aria-label="Unread"></span>' : ""}
  </article>`;
}

function readingView() {
  const email = state.selectedEmail;
  if (!email) return inboxView();
  const plainBody = escapeHtml(email.bodyText || email.body_plain || email.preview || "").replaceAll("\n", "<br />");
  const safeHtml = email.bodyHtmlSafe || email.body_html || "";
  const messageBody = email._loading ? "<p>Loading email…</p>" : safeHtml && state.bodyMode === "formatted" ? '<iframe class="message-frame" data-message-frame sandbox="allow-popups allow-popups-to-escape-sandbox" title="Formatted email content"></iframe>' : `<p>${plainBody}</p>`;
  const summary = state.aiSummary;
  const extraction = state.aiExtraction;
  return `<header class="compact-header">
    <button class="back-button" data-nav="inbox">${icon("arrow-left")}</button>
    <div><span class="eyebrow">Inbox / Primary</span><h1 data-user-content>${escapeHtml(email.subject)}</h1></div>
    <div class="header-actions"><button class="icon-button" title="Archive">${icon("archive")}</button><button class="icon-button" title="Delete">${icon("trash-2")}</button><button class="icon-button" title="More">${icon("ellipsis")}</button></div>
  </header>
  <div class="reading-grid">
    <article class="message-card">
      <div class="message-from" data-user-content><span class="avatar">${escapeHtml(String(email.sender || "?")[0].toUpperCase())}</span><div><strong>${escapeHtml(email.sender)}</strong><small>${escapeHtml((email.recipients || []).join(", ") || email.to || "")}</small></div><time datetime="${escapeHtml(email.receivedAt || email.date || "")}">${escapeHtml(formatFullMailTime(email.receivedAt || email.date || "", { locale: state.preferences.language }))}</time><button class="star-button">${icon("star")}</button></div>
      ${safeHtml ? `<div class="body-mode"><button class="text-button ${state.bodyMode === "formatted" ? "active" : ""}" data-body-mode="formatted">Formatted</button><button class="text-button ${state.bodyMode === "plain" ? "active" : ""}" data-body-mode="plain">Plain text</button></div>` : ""}
      <div class="message-body" data-user-content>${messageBody}</div>
      ${(email.attachments || []).length ? `<ul class="attachment-list" aria-label="Attachments">${email.attachments.map((attachment) => `<li>${icon("paperclip")} ${escapeHtml(attachment.filename)} <small>${escapeHtml(attachment.mimeType)} · ${Number(attachment.size || 0)} bytes</small></li>`).join("")}</ul>` : ""}
      <div class="message-actions"><button class="secondary-button" data-reply>${icon("reply")} Reply</button><button class="secondary-button">${icon("reply-all")} Reply all</button><button class="secondary-button">${icon("forward")} Forward</button></div>
    </article>
    <aside class="ai-rail">
      <section class="insight-card summary-card"><div class="insight-title"><span>${icon("sparkles")}</span><div><small>REVO AI</small><h2>Summary</h2></div>${summary ? "" : `<button class="text-button" data-ai-summarise ${state.aiSummaryLoading ? "disabled" : ""}>${state.aiSummaryLoading ? "Generating…" : "Summarise"}</button>`}</div>${summary ? `<p data-user-content>${escapeHtml(summary.summary)}</p><ul data-user-content>${(summary.bullets || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>${state.aiSummaryLoading ? "Summarising…" : "Generate a summary for this email."}</p>`}</section>
      <section class="insight-card"><div class="insight-title"><span>${icon("scan-text")}</span><div><small>EXTRACTED</small><h2>Key details</h2></div>${extraction ? "" : `<button class="text-button" data-ai-extract ${state.aiExtractionLoading ? "disabled" : ""}>${state.aiExtractionLoading ? "Extracting…" : "Extract"}</button>`}</div>${extraction ? renderExtraction(extraction) : `<p>${state.aiExtractionLoading ? "Extracting details…" : "Extract tasks and events from this email."}</p>`}</section>
    </aside>
  </div>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`;
}

function renderExtraction(extraction, { events: showEvents = true, tasks: showTasks = true, removable = false, empty = "No explicit tasks or events were found." } = {}) {
  const events = showEvents ? (extraction.events || []).map((event, index) => {
    const key = eventKey(event);
    const added = state.addedEvents[key];
    return `<li class="extraction-item"><span class="extraction-copy"><strong class="extraction-title" data-user-content>${escapeHtml(event.title || "Event")}</strong><span class="extraction-meta" data-user-content>${escapeHtml([event.date, event.time, event.location].filter(Boolean).join(" · "))}</span></span><span class="extraction-actions">${added ? `<a href="${escapeHtml(added)}" target="_blank" rel="noopener noreferrer">${t("Open in Google Calendar")}</a>` : `<button class="text-button" data-add-calendar="${index}">${t("Add to Google Calendar")}</button>`}${removable ? `<button class="text-button remove-action" data-remove-extraction="events" data-remove-index="${index}" aria-label="Remove event suggestion">Remove</button>` : ""}</span></li>`;
  }) : [];
  const tasks = showTasks ? (extraction.tasks || []).map((task, index) => `<li class="extraction-item"><span><strong>${escapeHtml(task.title || "Task")}</strong> ${escapeHtml(task.due_date || "")}</span>${removable ? `<button class="text-button remove-action" data-remove-extraction="tasks" data-remove-index="${index}" aria-label="Remove task suggestion">Remove</button>` : ""}</li>`) : [];
  const items = [...events, ...tasks];
  return items.length ? `<ul class="extraction-list" data-user-content>${items.join("")}</ul>` : `<p>${escapeHtml(empty)}</p>`;
}

function replyView() {
  const draft = state.aiDraft;
  return `<header class="compact-header">
    <button class="back-button" data-view="reading">${icon("arrow-left")}</button>
    <div><span class="eyebrow">AI generated · review before sending</span><h1>Reply draft</h1></div>
    <button class="secondary-button" data-regenerate>${icon("refresh-cw")} Regenerate</button>
  </header>
  <section class="composer-card">
    <div class="field-row"><label>To</label><div class="input-shell">${escapeHtml((state.selectedEmail?.reply_to || [state.selectedEmail?.sender || ""]).join(", "))}</div></div>
    <div class="field-row"><label>Subject</label><div class="input-shell">${escapeHtml(replySubject(state.selectedEmail?.subject))}</div></div>
    ${draftInstructions("reply")}<div class="ai-draft-label"><span>${icon("sparkles")} AI generated reply</span><small>Edit as needed</small></div>
    ${state.aiDraftLoading ? '<div class="reply-editor">Generating draft…</div>' : `<textarea aria-label="Reply draft" id="reply-text" class="reply-editor">${escapeHtml(draft)}</textarea>`}
    <div class="tone-row"><span>Quick tone</span>${["professional", "concise", "friendly"].map((tone) => `<button class="tone-chip ${state.aiDraftTone === tone ? "active" : ""}" data-tone="${tone}">${tone[0].toUpperCase() + tone.slice(1)}</button>`).join("")}</div>
    <div class="composer-footer"><div class="compose-tools"><button class="icon-button">${icon("paperclip")}</button><button class="icon-button">${icon("smile")}</button><button class="icon-button">${icon("image")}</button><button class="icon-button" data-voice>${icon("mic")}</button></div><div><button class="secondary-button" data-discard>Discard</button><button class="primary-button" data-send>${icon("send")} Send reply</button></div></div>
  </section>`;
}

function tasksView(calendarOnly = false) {
  const extraction = state.aiExtraction;
  const title = calendarOnly ? "Calendar" : "Tasks";
  const content = extraction
    ? renderExtraction(extraction, calendarOnly
      ? { tasks: false, removable: true, empty: "No calendar events were extracted from the selected email." }
      : { events: false, removable: true, empty: "No tasks were extracted from the selected email." })
    : `<p>No extracted ${calendarOnly ? "calendar events" : "tasks"} yet. Open an email and choose Extract.</p>`;
  return `<header class="page-header"><div><h1>${title}</h1><p>Extracted from the selected email</p></div></header><section class="task-card extraction-card">${content}</section><p>${calendarOnly ? "AI suggestions require review before adding to your calendar." : "Remove suggestions that are not useful; this does not change the source email."}</p><button class="floating-mic" data-voice aria-label="Voice commands">${icon("mic")}</button>`;
}

function settingsView() {
  return preferencesView({ preferences: state.preferences, models: state.allowedAiModels, status: state.settingsStatus, error: state.settingsError, accounts: connectedAccountsGroup(), escape: escapeHtml, t });
}

function connectedAccountsGroup() {
  const content = state.accounts.length ? state.accounts.map((account) => {
    const provider = "Google";
    const busy = state.accountBusy === account.id;
    return `<article class="connected-account">
      <div class="account-provider"><span class="provider provider-google">G</span><span><strong>${provider}</strong><small data-user-content>${escapeHtml(account.email)}</small></span></div>
      <span class="connection-status ${account.status.toLowerCase()}">${escapeHtml(account.status.replaceAll("_", " "))}</span>
      ${account.requiresReauthorization ? '<p class="provider-note">Reconnect to enable read/unread, starring, and confirmed sending.</p>' : ""}
      ${account.calendarRequiresReauthorization ? `<p class="provider-note">${t("Reconnect to enable confirmed Google Calendar events.")}</p>` : ""}
      <details><summary>Granted permissions</summary><ul>${account.scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join("")}</ul></details>
      <div class="account-actions"><button class="secondary-button" data-reauthorize="${account.id}" ${busy ? "disabled" : ""}>Reconnect</button><button class="danger-button" data-disconnect="${account.id}" data-provider-name="${provider}" data-account-email="${escapeHtml(account.email)}" ${busy ? "disabled" : ""}>Disconnect</button></div>
    </article>`;
  }).join("") : '<div class="empty-account"><p>No connected Gmail account.</p><p>Sign out, then connect Google from the sign-in page.</p></div>';
  return settingGroup("Connected accounts", "shield-check", `<div class="connected-account-list">${content}<div class="session-actions"><span><strong>RevoMail session</strong><small>Signing out keeps provider access connected until you disconnect it above.</small></span><button class="secondary-button" data-logout>${icon("log-out")} Sign out of RevoMail</button></div></div>`);
}

function settingGroup(title, groupIcon, content) {
  return `<section class="setting-group"><h2>${icon(groupIcon)} ${title}</h2>${content}</section>`;
}

function selectSetting(label, settingIcon, values) {
  return `<label class="setting-row"><div class="setting-name">${icon(settingIcon)}<span><strong>${label}</strong><small>Set your default preference</small></span></div><select>${values.map((value) => `<option>${value}</option>`).join("")}</select></label>`;
}

function composeView() {
  return `<header class="compact-header"><button class="back-button" data-nav="inbox">${icon("arrow-left")}</button><div><span class="eyebrow">New message</span><h1>Compose</h1></div></header>
  <section class="composer-card compose-new">${draftInstructions("compose")}<div class="field-row"><label for="compose-to">To</label><input value="${escapeHtml(state.compose.to)}" id="compose-to" class="input-shell" placeholder="Recipient" /></div><div class="field-row"><label for="compose-subject">Subject</label><input value="${escapeHtml(state.compose.subject)}" id="compose-subject" class="input-shell" placeholder="Email subject" /></div><textarea aria-label="Message" id="compose-body" class="reply-editor" placeholder="Write a message, or ask Revo AI for a first draft…">${escapeHtml(state.compose.body)}</textarea><div class="composer-footer"><div class="compose-tools"><button class="icon-button">${icon("paperclip")}</button><button class="icon-button">${icon("smile")}</button><button class="icon-button" data-voice>${icon("mic")}</button></div><button class="primary-button" data-send>${icon("send")} Send</button></div></section>`;
}

function sendConfirmationModal() {
  const draft = state.sendConfirmation;
  if (!draft) return "";
  return `<div class="modal-backdrop"><section class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="send-title">
    <div class="modal-header"><div><span class="eyebrow">FINAL REVIEW</span><h2 id="send-title">Confirm email send</h2></div><button class="icon-button" data-cancel-send aria-label="Cancel send">${icon("x")}</button></div>
    <dl class="send-review"><div><dt>To</dt><dd>${escapeHtml(draft.to.join(", "))}</dd></div>${draft.cc.length ? `<div><dt>Cc</dt><dd>${escapeHtml(draft.cc.join(", "))}</dd></div>` : ""}<div><dt>Subject</dt><dd>${escapeHtml(draft.subject)}</dd></div></dl>
    <label>Message<textarea id="confirmed-body" class="reply-editor">${escapeHtml(draft.bodyText)}</textarea></label>
    <p>RevoMail will contact Gmail only after you choose “Confirm and send”.</p>
    <div class="modal-footer"><button class="secondary-button" data-cancel-send ${state.sendBusy ? "disabled" : ""}>Keep editing</button><button class="primary-button" data-confirm-send ${state.sendBusy ? "disabled" : ""}>${state.sendBusy ? "Sending…" : "Confirm and send"}</button></div>
  </section></div>`;
}

function placeholderView(title, navIcon) {
  return `<header class="page-header"><div><span class="eyebrow">Mailbox</span><h1>${title}</h1><p>Your ${title.toLowerCase()} messages live here.</p></div></header><div class="placeholder-card">${icon(navIcon)}<h2>${title} is ready</h2><p>This demo focuses on the AI-assisted inbox flow from the presentation mock.</p><button class="secondary-button" data-nav="inbox">Back to inbox</button></div>`;
}

function voiceModal() {
  return state.voiceOpen ? voiceView({ voice: state.voice, enabled: state.preferences.voiceEnabled, capabilities: state.capabilities, escape: escapeHtml, t }) : "";
}

function toast() {
  return state.toast ? `<div class="toast ${state.toastError ? "error" : ""}"><span>${escapeHtml(t(state.toast))}</span></div>` : "";
}

function currentViewContent() {
  if (state.view === "inbox") return inboxView();
  if (state.view === "reading") return readingView();
  if (state.view === "reply") return replyView();
  if (state.view === "tasks") return tasksView();
  if (state.view === "calendar") return tasksView(true);
  if (state.view === "settings") return settingsView();
  if (state.view === "compose") return composeView();
  if (state.view === "starred") return placeholderView("Starred", "star");
  if (state.view === "drafts") return placeholderView("Drafts", "file");
  return sentView();
}

function updateSidebarState() {
  const sidebarElement = app.querySelector(".sidebar");
  if (!sidebarElement) return;
  sidebarElement.querySelectorAll("[data-nav]").forEach((button) => {
    button.classList.toggle("active", button.dataset.nav === state.view);
    if (button.dataset.nav === state.view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  const inboxButton = sidebarElement.querySelector('[data-nav="inbox"]');
  const unreadCount = emails.filter((email) => email.unread).length;
  let badge = inboxButton?.querySelector(".nav-count");
  if (unreadCount && inboxButton) {
    if (!badge) {
      badge = document.createElement("b");
      badge.className = "nav-count";
      inboxButton.append(badge);
    }
    badge.textContent = String(unreadCount);
  } else {
    badge?.remove();
  }
}

function render() {
  applyPreferences();
  const workspaceFocus = captureFocus(app.querySelector("[data-workspace]"));
  if (state.authenticated === null) {
    app.innerHTML = `<main class="loading-page" aria-live="polite"><div class="brand-mark">${icon("mail")}</div><p>Checking your secure session…</p></main>`;
  } else if (!state.authenticated) {
    app.innerHTML = renderLogin() + toast();
  } else {
    let workspace = app.querySelector("[data-workspace]");
    if (!workspace) {
      app.innerHTML = shell("");
      workspace = app.querySelector("[data-workspace]");
    }
    const content = currentViewContent();
    if (workspace._content !== content) { workspace.innerHTML = content; workspace._content = content; }
    renderOverlays();
    updateSidebarState();
  }
  createIcons({ icons: demoIcons });
  bindEvents();
  hydrateSafeMessageFrame();
  enhanceAccessibility();
  translateUI(app, state.preferences.language);
  restoreFocus(app.querySelector("[data-workspace]"), workspaceFocus);
  syncDialog(app.querySelector('[role="dialog"]'), closeActiveDialog);
}

function hydrateSafeMessageFrame() {
  const frame = document.querySelector("[data-message-frame]");
  const safeHtml = state.selectedEmail?.bodyHtmlSafe || state.selectedEmail?.body_html || "";
  if (!frame || !safeHtml || frame.dataset.hydrated) return;
  frame.dataset.hydrated = "true";
  frame.srcdoc = messageFrameDocument(safeHtml);
}

let toastTimer;
let searchTimer;
let syncTimer;

function navigate(view, { render: shouldRender = true } = {}) {
  if (view !== "compose") { cancelRequest("ai-compose"); state.composeLoading = false; }
  if (view !== "sent") { cancelRequest("sent-list"); state.sentLoading = false; }
  if (view !== "inbox") {
    clearTimeout(searchTimer);
    cancelRequest("mailbox-list");
    state.emailsLoading = false;
  }
  if (!["reading", "reply"].includes(view)) {
    cancelRequest("message-detail");
    cancelRequest("ai-summary");
    cancelRequest("ai-extraction");
    cancelRequest("ai-draft");
    state.aiSummaryLoading = false;
    state.aiExtractionLoading = false;
    state.aiDraftLoading = false;
  }
  if (state.voiceOpen) closeVoice(false);
  state.view = view;
  if (view === "sent") void fetchSent();
  if (shouldRender) { render(); app.querySelector("[data-workspace] h1")?.focus(); }
}

function showToast(message, error = true) {
  state.toast = message; state.toastError = error;
  clearTimeout(toastTimer);
  const region = document.getElementById(error ? "error-announcement" : "status-announcement");
  if (region) region.textContent = t(message);
  render();
  toastTimer = setTimeout(() => { state.toast = ""; render(); }, 5000);
}

function openVoice() {
  if (state.sendConfirmation || state.calendarDraft) return;
  state.voice = { status: "idle", text: "", error: "", targetId: state.selectedEmail?.id, targetSubject: state.selectedEmail?.subject || "" };
  state.voiceOpen = true; render();
}

function bindEvents() {
  const roots = state.authenticated
    ? [app.querySelector("[data-workspace]"), app.querySelector("[data-overlays]")].filter(Boolean)
    : [app];
  const sidebarElement = app.querySelector(".sidebar:not([data-events-bound])");
  if (sidebarElement) {
    sidebarElement.dataset.eventsBound = "true";
    roots.push(sidebarElement);
  }
  const queryAll = (selector) => roots.flatMap((root) => [...root.querySelectorAll(selector)]).filter(element => {
    const events = element._boundSelectors ||= new Set();
    if (events.has(selector)) return false; events.add(selector); return true;
  });
  const query = (selector) => queryAll(selector)[0] || null;

  queryAll("[data-login]").forEach((button) => button.addEventListener("click", () => {
    button.disabled = true;
    button.lastChild.textContent = " Redirecting…";
    window.location.assign(`/api/v1/auth/google/start?returnTo=${encodeURIComponent(window.location.pathname)}`);
  }));
  query("[data-clear-auth-error]")?.addEventListener("click", () => { state.authError = ""; render(); });
  queryAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
    try { await api("/api/v1/auth/logout", { method: "POST" }); } catch (error) { showToast(error.message); return; }
    closeVoice(false); writer.reset(); state.preferences = { ...DEFAULT_PREFERENCES }; state.compose = { to: "", subject: "", body: "" };
    for (const key of ["ai-compose", "ai-draft", "ai-summary", "ai-extraction", "message-detail", "mailbox-list", "sent-list"]) cancelRequest(key);
    clearTimeout(syncTimer);
    state.sent = []; state.sentCursor = null; state.calendarDraft = null; state.addedEvents = {}; state.calendarAttempts = {}; state.aiInstructions = { reply: "", compose: "" };
    state.authenticated = false; state.user = null; state.csrfToken = ""; state.accounts = []; state.view = "inbox"; resetMailbox(); render();
  }));
  queryAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  queryAll("[data-view]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.view)));
  queryAll("[data-email]").forEach((row) => {
    row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); row.click(); } });
    row.addEventListener("click", async (event) => {
    if (event.target.closest("button")) return;
    const selected = [...emails, ...state.sent].find((email) => String(email.id) === row.dataset.email);
    if (!selected) return;
    state.aiSummary = null;
    state.aiExtraction = null;
    state.aiDraft = "";
    state.selectedEmail = { ...selected, _loading: !selected.body_plain && !selected.body_html };
    state.selectedEmail.unread = false;
    navigate("reading");
    if (!state.selectedEmail._loading) return;
    const controller = beginRequest("message-detail");
    try {
      state.selectedEmail = await api(`/api/v1/emails/${encodeURIComponent(selected.id)}`, { signal: controller.signal });
      const cached = emails.find((item) => String(item.id) === String(selected.id));
      if (cached?.unread) void updateMessageState(cached, { unread: false });
      render();
    } catch (error) {
      if (isAbortError(error)) return;
      state.selectedEmail._loading = false;
      showToast(error.message);
    } finally {
      finishRequest("message-detail", controller);
    }
    });
  });
  queryAll("[data-star]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const email = [...emails, ...state.sent].find((item) => String(item.id) === button.dataset.star); if (email) void updateMessageState(email, { starred: !email.starred }); }));
  queryAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; void fetchEmails(); }));
  queryAll("[data-priority]").forEach((button) => button.addEventListener("click", () => { state.priority = button.dataset.priority; render(); }));
  query("#search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void fetchEmails(), 350);
  });
  query("[data-compose]")?.addEventListener("click", () => navigate("compose"));
  query("[data-reply]")?.addEventListener("click", () => void replyAction());
  query("[data-regenerate]")?.addEventListener("click", () => void aiDraftReply(state.aiDraftTone));
  queryAll("[data-tone]").forEach((button) => button.addEventListener("click", () => void aiDraftReply(button.dataset.tone)));
  query("[data-discard]")?.addEventListener("click", () => navigate("reading"));
  queryAll("[data-send]").forEach((button) => button.addEventListener("click", () => prepareSendConfirmation()));
  queryAll("[data-cancel-send]").forEach((button) => button.addEventListener("click", closeSendConfirmation));
  query("[data-confirm-send]")?.addEventListener("click", () => void confirmSend());
  queryAll("[data-body-mode]").forEach((button) => button.addEventListener("click", () => { state.bodyMode = button.dataset.bodyMode; render(); }));
  query("[data-load-more]")?.addEventListener("click", () => void fetchEmails(state.nextPageToken));
  query("[data-retry-mailbox]")?.addEventListener("click", () => void startMailboxSync());
  query("[data-ai-summarise]")?.addEventListener("click", () => void aiSummarise());
  query("[data-ai-extract]")?.addEventListener("click", () => void aiExtract());
  queryAll("[data-disconnect]").forEach((button) => button.addEventListener("click", async () => {
    const confirmed = window.confirm(`Disconnect ${button.dataset.providerName} account ${button.dataset.accountEmail}? RevoMail will revoke provider access where supported and permanently remove its stored credentials and active connection.`);
    if (!confirmed) return;
    state.accountBusy = button.dataset.disconnect; render();
    try { await api(`/api/v1/accounts/${button.dataset.disconnect}`, { method: "DELETE" }); await loadAccounts(); showToast("Account disconnected and local credentials removed", false); }
    catch (error) { state.accountBusy = ""; showToast(error.message); }
  }));
  queryAll("[data-reauthorize]").forEach((button) => button.addEventListener("click", async () => {
    state.accountBusy = button.dataset.reauthorize; render();
    try { const result = await api(`/api/v1/accounts/${button.dataset.reauthorize}/reauthorize`, { method: "POST" }); window.location.assign(result.authorizationUrl); }
    catch (error) { state.accountBusy = ""; showToast(error.message); }
  }));
  queryAll("[data-voice]").forEach((button) => button.addEventListener("click", openVoice));
  query("[data-close-voice]")?.addEventListener("click", () => closeVoice());
  query(".modal-backdrop")?.addEventListener("click", event => { if (event.target.classList.contains("modal-backdrop")) closeActiveDialog(); });
  queryAll("[data-preference]").forEach(input => input.addEventListener("change", () => {
    const patch = { [input.dataset.preference]: input.type === "checkbox" ? input.checked : input.value };
    Object.assign(state.preferences, patch);
    if (patch.voiceEnabled === false) voiceController.cancel();
    applyPreferences(); void writer.update(patch);
  }));
  query("[data-retry-save]")?.addEventListener("click", () => void writer.flush());
  query("[data-retry-settings]")?.addEventListener("click", () => void loadPreferences());
  query("[data-record]")?.addEventListener("click", startRecording);
  query("[data-restart-recording]")?.addEventListener("click", startRecording);
  query("[data-cancel-recording]")?.addEventListener("click", () => { state.voice.text = ""; voiceController.cancel(); });
  query("[data-pause]")?.addEventListener("click", () => state.voice.status === "paused" ? voiceController.resume() : voiceController.pause());
  query("[data-finish-recording]")?.addEventListener("click", () => voiceController.finish());
  query("#voice-transcript")?.addEventListener("input", event => {
    state.voice.text = event.target.value; state.voice.error = "";
    const run = app.querySelector("[data-run-command]"); if (run) run.disabled = !state.voice.text.trim();
  });
  queryAll("[data-command]").forEach(button => button.addEventListener("click", () => { state.voice.text = button.dataset.command; state.voice.error = ""; render(); }));
  query("[data-run-command]")?.addEventListener("click", () => void runVoiceCommand());
  queryAll("[data-ai-instructions]").forEach(input => input.addEventListener("input", () => { state.aiInstructions[input.dataset.aiInstructions] = input.value; }));
  queryAll("[data-custom-draft]").forEach(button => button.addEventListener("click", () => button.dataset.customDraft === "reply" ? void aiDraftReply(state.aiDraftTone) : void aiCompose()));
  queryAll("[data-add-calendar]").forEach(button => button.addEventListener("click", () => openCalendarDialog(Number(button.dataset.addCalendar))));
  queryAll("[data-remove-extraction]").forEach(button => button.addEventListener("click", () => {
    const kind = button.dataset.removeExtraction;
    const index = Number(button.dataset.removeIndex);
    if (!state.aiExtraction || !["events", "tasks"].includes(kind) || !Number.isInteger(index)) return;
    const items = state.aiExtraction[kind] || [];
    if (!items[index]) return;
    state.aiExtraction = { ...state.aiExtraction, [kind]: items.filter((_item, itemIndex) => itemIndex !== index) };
    showToast(kind === "events" ? "Event suggestion removed" : "Task suggestion removed", false);
  }));
  query("[data-cancel-calendar]")?.addEventListener("click", closeCalendar);
  query("[data-confirm-calendar]")?.addEventListener("click", () => void submitCalendar());
  queryAll("[data-cal-field]").forEach(input => input.addEventListener(input.type === "checkbox" ? "change" : "input", () => {
    if (!state.calendarDraft || state.calendarSaving) return;
    state.calendarDraft[input.dataset.calField] = input.type === "checkbox" ? input.checked : input.value;
    if (input.type === "checkbox") render();
  }));
  query("[data-sent-more]")?.addEventListener("click", () => void fetchSent(state.sentCursor));
  query("[data-sent-retry]")?.addEventListener("click", () => void fetchSent());
  query("#reply-text")?.addEventListener("input", event => { state.aiDraft = event.target.value; });
  for (const [id, key] of [["compose-to", "to"], ["compose-subject", "subject"], ["compose-body", "body"]]) {
    query("#" + id)?.addEventListener("input", event => { state.compose[key] = event.target.value; });
  }
  query("#confirmed-body")?.addEventListener("input", event => { if (state.sendConfirmation) state.sendConfirmation.bodyText = event.target.value; });
}

function activeAccount() {
  return state.accounts[0] || null;
}

async function updateMessageState(email, change) {
  const account = activeAccount();
  if (!account) return;
  const previous = { unread: email.unread, starred: email.starred };
  Object.assign(email, change);
  if (state.selectedEmail && String(state.selectedEmail.id) === String(email.id)) Object.assign(state.selectedEmail, change);
  render();
  try {
    await api(`/api/v1/emails/${encodeURIComponent(email.id)}`, { method: "PATCH", body: JSON.stringify(change) });
  } catch (error) {
    Object.assign(email, previous);
    if (state.selectedEmail && String(state.selectedEmail.id) === String(email.id)) Object.assign(state.selectedEmail, previous);
    showToast(error.status === 401 ? "Mailbox authorization expired. Reconnect in Settings." : error.message);
  }
}

function prepareSendConfirmation() {
  if (state.calendarDraft || state.aiDraftLoading || state.composeLoading) return;
  if (state.voiceOpen) closeVoice(false);
  const account = activeAccount();
  if (!account) return;
  if (state.view === "reply") {
    const bodyText = document.querySelector("#reply-text")?.value.trim() || "";
    state.sendConfirmation = {
      to: state.selectedEmail?.reply_to || [state.selectedEmail?.sender || ""], cc: [], bcc: [], subject: replySubject(state.selectedEmail?.subject),
      bodyText, inReplyToMessageId: String(state.selectedEmail?.id || ""), idempotencyKey: crypto.randomUUID(),
    };
  } else {
    const to = (document.querySelector("#compose-to")?.value || "").split(",").map((value) => value.trim()).filter(Boolean);
    state.sendConfirmation = {
      to, cc: [], bcc: [], subject: (document.querySelector("#compose-subject")?.value || "").trim(),
      bodyText: (document.querySelector("#compose-body")?.value || "").trim(), idempotencyKey: crypto.randomUUID(),
    };
  }
  if (!state.sendConfirmation.to.length || !state.sendConfirmation.subject || !state.sendConfirmation.bodyText) {
    state.sendConfirmation = null;
    showToast("Add a recipient, subject, and message before sending.");
    return;
  }
  render();
  setTimeout(() => document.querySelector("#confirmed-body")?.focus(), 0);
}

function closeSendConfirmation() {
  if (state.sendBusy) return;
  state.sendConfirmation = null;
  render();
  setTimeout(() => document.querySelector("[data-send]")?.focus(), 0);
}

async function confirmSend() {
  const account = activeAccount();
  if (!account || !state.sendConfirmation || state.sendBusy) return;
  state.sendConfirmation.bodyText = document.querySelector("#confirmed-body")?.value.trim() || "";
  state.sendBusy = true;
  render();
  try {
    const result = await api("/api/v1/emails/send", {
      method: "POST", body: JSON.stringify({ ...state.sendConfirmation, confirmed: true })
    });
    state.sendConfirmation = null;
    if (result.status === "sent") {
      state.view = "sent";
      showToast("Message sent after final confirmation.", false);
    } else if (result.status === "unknown") {
      showToast("Delivery is unknown. RevoMail will not resend automatically.");
    } else {
      showToast("Gmail rejected the message. It was not marked as sent.");
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.sendBusy = false;
    render();
  }
}

// Ask the AI to label a page of inbox messages. Runs after the list has rendered so a slow or
// failed classification never blocks reading mail; unlabelled messages simply show no badge.
async function classifyEmails(messages) {
  const pending = messages.filter((message) => !message.priority);
  if (!pending.length) return;
  state.classifying = true;
  state.classifyNote = "";
  render();
  try {
    const payload = await api("/api/v1/ai/classify", {
      method: "POST",
      body: JSON.stringify({ messages: pending.map((message) => ({ id: String(message.id), sender: message.sender || "", subject: message.subject || "", preview: message.preview || "" })) })
    });
    emails = applyClassifications(emails, payload?.classifications);
    const labelled = Object.keys(payload?.classifications || {}).length;
    if (payload?.warning === "unreadable_reply") state.classifyNote = "Priority labels unavailable (the AI reply could not be read)";
    else if (payload?.warning === "no_valid_labels") state.classifyNote = "Priority labels unavailable (the AI returned no usable labels)";
    else if (labelled < pending.length) state.classifyNote = `${pending.length - labelled} email${pending.length - labelled === 1 ? "" : "s"} could not be classified`;
  } catch (error) {
    state.classifyNote = "Priority labels unavailable";
  } finally {
    state.classifying = false;
    render();
  }
}

async function fetchEmails(pageToken = null, { background = false } = {}) {
  const account = activeAccount();
  if (!account) return;
  const controller = beginRequest("mailbox-list");
  if (!pageToken && !background) resetMailbox();
  if (!background) state.emailsLoading = true;
  state.emailsError = "";
  if (!background) render();
  try {
    const query = new URLSearchParams({ max_results: "20" });
    if (pageToken) query.set("page_token", pageToken);
    if (state.search.trim()) query.set("query", state.search.trim());
    if (state.category !== "All") query.set("category", state.category);
    const payload = await api(`/api/v1/emails?${query}`, { signal: controller.signal });
    const mailbox = applyMailboxPage(emails, payload, { append: Boolean(pageToken) });
    emails = mailbox.messages;
    state.nextPageToken = mailbox.nextPageToken;
    state.sync = mailbox.sync;
    if (!pageToken) {
      state.selectedEmail = selectAfterMailboxRefresh(state.selectedEmail, emails, { background });
    }
    void classifyEmails(payload?.messages || []);
  } catch (error) {
    if (isAbortError(error)) return;
    state.emailsError = error.status === 401 ? "Your mailbox session expired. Reconnect the account in Settings." : error.message;
  } finally {
    if (!finishRequest("mailbox-list", controller)) return;
    if (!background) state.emailsLoading = false;
    render();
  }
}

async function startMailboxSync() {
  const account = activeAccount();
  if (!account) return;
  state.emailsError = "";
  try {
    const started = await api("/api/v1/emails/sync", { method: "POST" });
    state.sync = { ...(state.sync || {}), status: started.status, jobId: started.jobId };
    render();
    pollMailboxSync(started.jobId);
  } catch (error) {
    state.emailsError = error.message;
    render();
  }
}

function pollMailboxSync(jobId) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const result = await api(`/api/v1/emails/sync/${encodeURIComponent(jobId)}`);
      state.sync = result.sync;
      if (result.sync.status === "syncing" && result.sync.jobId) {
        pollMailboxSync(result.sync.jobId);
      } else {
        await fetchEmails(null, { background: true });
      }
    } catch (error) {
      state.emailsError = error.message;
      render();
    }
  }, 700);
}
function resetMailbox() {
  emails = [];
  state.priority = "All";
  state.classifyNote = "";
  state.selectedEmail = null;
  state.nextPageToken = null;
  state.sync = null;
  state.aiSummary = null;
  state.aiExtraction = null;
  state.aiDraft = "";
}

async function aiSummarise() {
  if (!state.selectedEmail) return;
  const controller = beginRequest("ai-summary");
  state.aiSummaryLoading = true;
  render();
  try {
    state.aiSummary = await api("/api/v1/ai/summarise", { method: "POST", body: JSON.stringify({ message_id: String(state.selectedEmail.id) }), signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) return;
    showToast(error.message);
  } finally {
    if (!finishRequest("ai-summary", controller)) return;
    state.aiSummaryLoading = false;
    render();
  }
}

async function aiExtract() {
  if (!state.selectedEmail) return;
  const controller = beginRequest("ai-extraction");
  state.aiExtractionLoading = true;
  render();
  try {
    state.aiExtraction = await api("/api/v1/ai/extract", { method: "POST", body: JSON.stringify({ message_id: String(state.selectedEmail.id) }), signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) return;
    showToast(error.message);
  } finally {
    if (!finishRequest("ai-extraction", controller)) return;
    state.aiExtractionLoading = false;
    render();
  }
}

async function aiDraftReply(tone) {
  if (!state.selectedEmail) return;
  const controller = beginRequest("ai-draft");
  state.aiDraftTone = tone;
  state.aiDraftLoading = true;
  render();
  try {
    const payload = await api("/api/v1/ai/draft-reply", { method: "POST", body: JSON.stringify({ message_id: String(state.selectedEmail.id), tone, instructions: state.aiInstructions.reply, current_draft: state.aiDraft }), signal: controller.signal });
    state.aiDraft = payload.draft;
  } catch (error) {
    if (isAbortError(error)) return;
    showToast(error.message);
  } finally {
    if (!finishRequest("ai-draft", controller)) return;
    state.aiDraftLoading = false;
    render();
  }
}

async function loadAccounts() {
  const payload = await api("/api/v1/accounts");
  state.accounts = payload.accounts;
  state.accountBusy = "";
  render();
}

async function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const errorMessages = {
    AUTHORIZATION_DENIED: "Authorization was cancelled. You can try again.",
    INVALID_OAUTH_STATE: "The sign-in request expired or could not be verified. Please try again.",
    INSUFFICIENT_PERMISSIONS: "The required Gmail permissions were not granted.",
    AUTHORIZATION_SCOPE_MISMATCH: "Google returned permissions from an older RevoMail authorization. Remove RevoMail access from your Google account, then try again.",
    AUTHORIZATION_NETWORK_FAILED: "RevoMail could not reach Google to complete sign-in. Check your connection and try again.",
    AUTHORIZATION_FAILED: "Sign-in could not be completed. Please try again."
  };
  if (params.has("authError")) state.authError = errorMessages[params.get("authError")] || "Sign-in could not be completed. Please try again.";
  const requestedView = params.get("view");
  history.replaceState({}, "", window.location.pathname);
  try {
    const session = await api("/api/v1/auth/session");
    state.providers = session.providers;
    state.authenticated = session.authenticated;
    if (session.authenticated) {
      state.user = session.user;
      state.csrfToken = session.csrfToken;
      await loadPreferences();
      if (requestedView === "settings") state.view = "settings";
      const accounts = await api("/api/v1/accounts");
      state.accounts = accounts.accounts;
      if (state.accounts.length) { await fetchEmails(); void startMailboxSync(); }
      else resetMailbox();
    }
  } catch (error) {
    state.authenticated = false;
    state.authError ||= "RevoMail could not check provider availability.";
  }
  render();
}

function t(text) { return translate(text, state.preferences.language); }

function applyPreferences() {
  const p = state.preferences;
  document.body.dataset.theme = p.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : p.theme;
  document.documentElement.dataset.reduceMotion = String(p.reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches);
  document.documentElement.lang = p.language;
}

const writer = new PreferenceWriter(
  patch => api("/api/v1/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  (status, values) => { if (values) state.preferences = values; state.settingsStatus = status; render(); }
);

async function loadPreferences() {
  state.settingsStatus = "loading"; state.settingsError = false;
  try {
    const payload = await api("/api/v1/settings");
    state.preferences = payload.settings; state.allowedAiModels = payload.allowedAiModels;
    state.settingsStatus = "saved";
    state.capabilities = await api("/api/v1/voice/capabilities").catch(() => null);
  } catch { state.settingsError = true; state.settingsStatus = "error"; }
  render();
}

const voiceController = new VoiceController({
  transcribe: (blob, language, signal) => api(`/api/v1/voice/transcriptions?language=${encodeURIComponent(language)}`, {
    method: "POST", body: blob, headers: { "content-type": blob.type }, signal
  }),
  changed: update => {
    if (!state.voiceOpen) return;
    state.voice = { ...state.voice, error: "", ...update };
    render();
  }
});

function startRecording() {
  if (!state.preferences.voiceEnabled || !state.capabilities?.available || writer.saving || state.settingsStatus === "error") {
    state.voice.error = "Enable voice input in Settings to record. You can type below."; render(); return;
  }
  state.voice.text = "";
  void voiceController.start(state.capabilities, state.preferences.speechLanguage);
}

function closeVoice(shouldRender = true) {
  state.voiceOpen = false;
  voiceController.cancel();
  state.voice = { status: "idle", text: "", error: "", targetId: null, targetSubject: "" };
  if (shouldRender) render();
}

function closeActiveDialog() {
  if (state.sendConfirmation) closeSendConfirmation();
  else if (state.calendarDraft) closeCalendar();
  else closeVoice();
}

async function replyAction() {
  if (!state.selectedEmail) return false;
  navigate("reply");
  return state.aiDraft ? true : aiDraftReply(state.aiDraftTone);
}

async function runVoiceCommand() {
  if (["executing", "requesting", "recording", "paused", "transcribing"].includes(state.voice.status)) return;
  let command;
  try { command = validateCommand(state.voice.text, state.voice.targetId, state.selectedEmail?.id); }
  catch (error) { state.voice.error = error.message; render(); return; }
  state.voice.status = "executing";
  closeVoice(false);
  if (command === "tasks") navigate("tasks");
  else if (command === "reply") await replyAction();
  else { navigate("reading"); await aiSummarise(); }
}

function renderOverlays() {
  const overlays = app.querySelector("[data-overlays]");
  if (!overlays.querySelector("[data-dialog-host]")) overlays.innerHTML = '<div data-dialog-host></div><div data-toast-host></div>';
  const host = overlays.querySelector("[data-dialog-host]");
  const content = voiceModal() + sendConfirmationModal() + calendarModal();
  if (host._content !== content) {
    const focus = captureFocus(host);
    host.innerHTML = content; host._content = content;
    restoreFocus(host, focus);
  }
  overlays.querySelector("[data-toast-host]").innerHTML = toast();
}

function enhanceAccessibility() {
  app.querySelectorAll("h1").forEach(heading => heading.tabIndex = -1);
  const iconLabels = { "arrow-left": "Back", "mic": "Voice commands", "star": "Star email", "paperclip": "Attachments", "smile": "Emoji", "image": "Image", "x": "Close" };
  app.querySelectorAll("button").forEach(button => {
    if (!button.textContent.trim() && !button.hasAttribute("aria-label")) {
      const name = button.getAttribute("title") || Object.entries(iconLabels).find(([key]) => button.querySelector(`[data-lucide="${key}"], .lucide-${key}`))?.[1];
      if (name) button.setAttribute("aria-label", name);
    }
    // Unimplemented prototype controls are explicitly unavailable.
    if (["Archive", "Delete", "More", "Reply all", "Forward", "Attachments", "Emoji", "Image"].includes(button.getAttribute("aria-label") || button.textContent.trim())) {
      button.disabled = true; button.title = "Not available yet";
    }
  });
  app.querySelectorAll('[data-nav="inbox"].back-button, [data-view].back-button').forEach(button => button.setAttribute("aria-label", "Back"));
}

for (const [id, role] of [["status-announcement", "status"], ["error-announcement", "alert"]]) {
  const region = document.createElement("div"); region.id = id; region.className = "sr-only"; region.setAttribute("role", role); document.body.append(region);
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyPreferences);
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", applyPreferences);
window.addEventListener("pagehide", () => voiceController.cancel());
render();
bootstrap();

function calendarModal() {
  const draft = state.calendarDraft;
  if (!draft) return "";
  const busy = state.calendarSaving ? "disabled" : "";
  const unresolved = !draft.date ? '<p class="cal-note">RevoMail could not work out an exact date from the email. Please enter it.</p>' : "";
  return `<div class="modal-backdrop" role="presentation"><section class="send-modal" role="dialog" aria-modal="true" aria-labelledby="cal-title">
    <div class="modal-header"><div><span class="eyebrow">GOOGLE CALENDAR</span><h2 id="cal-title">Add this event?</h2></div></div>
    ${unresolved}
    <div class="cal-form">
      <label>Title<input type="text" data-cal-field="title" maxlength="300" value="${escapeHtml(draft.title)}" ${busy} /></label>
      <label class="cal-check"><input type="checkbox" data-cal-field="allDay" ${draft.allDay ? "checked" : ""} ${busy} /> All day</label>
      <div class="cal-row">
        <label>Date<input type="date" data-cal-field="date" value="${escapeHtml(draft.date)}" ${busy} /></label>
        <label>Start<input type="time" data-cal-field="startTime" value="${escapeHtml(draft.startTime)}" ${draft.allDay || state.calendarSaving ? "disabled" : ""} /></label>
        <label>End<input type="time" data-cal-field="endTime" value="${escapeHtml(draft.endTime)}" ${draft.allDay || state.calendarSaving ? "disabled" : ""} /></label>
      </div>
      <label>Location<input type="text" data-cal-field="location" maxlength="500" value="${escapeHtml(draft.location)}" ${busy} /></label>
      <small class="cal-note">${t("Time zone:")} ${escapeHtml(userTimeZone())}. ${t("It is added to your primary Google Calendar.")}</small>
    </div>
    ${state.calendarError ? `<p class="send-error" role="alert">${escapeHtml(t(state.calendarError))}</p>` : ""}
    <div class="modal-footer"><button class="secondary-button" data-cancel-calendar ${busy}>Cancel</button><button class="primary-button" data-confirm-calendar ${busy}>${icon("calendar-plus")} ${state.calendarSaving ? "Adding…" : state.calendarError ? "Try again" : "Add to calendar"}</button></div>
  </section></div>`;
}

function userTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
function eventKey(event) { return JSON.stringify([state.selectedEmail?.id, event.title, event.start, event.date, event.time]); }
function openCalendarDialog(index) {
  const event = state.aiExtraction?.events?.[index];
  if (!event || !state.selectedEmail || state.sendConfirmation) return;
  closeVoice(false);
  const key = eventKey(event);
  state.calendarDraft = { ...eventDraftFromExtraction(event, state.selectedEmail.subject), eventKey: key, idempotencyKey: state.calendarAttempts[key] ||= crypto.randomUUID() };
  state.calendarError = ""; render();
}
function closeCalendar() { if (state.calendarSaving) return; state.calendarDraft = null; state.calendarError = ""; render(); }
async function submitCalendar() {
  const draft = state.calendarDraft;
  if (!draft || state.calendarSaving) return;
  const result = calendarPayload(draft, userTimeZone());
  if (result.error) { state.calendarError = result.error; render(); return; }
  state.calendarSaving = true; state.calendarError = ""; render();
  try {
    const created = await api("/api/v1/calendar/events", { method: "POST", body: JSON.stringify({ ...result.payload, confirmed: true, idempotencyKey: draft.idempotencyKey }) });
    const link = String(created.htmlLink || "");
    state.addedEvents[draft.eventKey] = /^https:\/\/(?:calendar\.google\.com|www\.google\.com)\//.test(link) ? link : "https://calendar.google.com/";
    state.calendarDraft = null; showToast("Added to Google Calendar", false);
  } catch (error) { state.calendarError = error.message; }
  finally { state.calendarSaving = false; render(); }
}
function draftInstructions(kind) {
  const busy = kind === "reply" ? state.aiDraftLoading : state.composeLoading;
  return `<div class="field-row"><label for="instructions-${kind}">${t("Draft instructions")}</label><textarea id="instructions-${kind}" data-ai-instructions="${kind}" maxlength="1000" ${busy ? "disabled" : ""}>${escapeHtml(state.aiInstructions[kind])}</textarea><button class="secondary-button" data-custom-draft="${kind}" ${busy ? "disabled" : ""}>${t(busy ? "Generating…" : "Generate or revise draft")}</button></div>`;
}
async function aiCompose() {
  if (state.composeLoading) return;
  const snapshot = { ...state.compose };
  const controller = beginRequest("ai-compose");
  state.composeLoading = true; render();
  try {
    const result = await api("/api/v1/ai/compose", { method: "POST", signal: controller.signal, body: JSON.stringify({ instructions: state.aiInstructions.compose, subject: snapshot.subject, current_draft: snapshot.body, tone: state.aiDraftTone }) });
    if (controller.signal.aborted) return;
    if (state.compose.body !== snapshot.body || state.compose.subject !== snapshot.subject) { showToast("Draft changed while generating. Retry with your latest text."); return; }
    state.compose.subject = result.subject; state.compose.body = result.draft;
  } catch (error) { if (!isAbortError(error)) showToast(error.message); }
  finally { if (finishRequest("ai-compose", controller)) { state.composeLoading = false; render(); } }
}
function sentView() {
  return `<header class="page-header"><h1>Sent</h1><button class="secondary-button" data-sent-retry ${state.sentLoading ? "disabled" : ""}>${t("Refresh")}</button></header><section class="mail-panel">${state.sentError ? `<p role="alert">${escapeHtml(state.sentError)}</p>` : ""}<div class="email-list">${state.sent.map(emailRow).join("") || `<p>${t(state.sentLoading ? "Loading…" : "No sent messages.")}</p>`}</div>${state.sentCursor ? `<button class="text-button" data-sent-more ${state.sentLoading ? "disabled" : ""}>${t("Load more")}</button>` : ""}</section>`;
}
async function fetchSent(cursor = null) {
  const controller = beginRequest("sent-list");
  state.sentLoading = true; state.sentError = ""; render();
  try {
    const query = new URLSearchParams({ label: "SENT", max_results: "20" });
    if (cursor) query.set("page_token", cursor);
    const result = await api(`/api/v1/emails?${query}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    const page = applyMailboxPage(state.sent, result, { append: Boolean(cursor) });
    state.sent = page.messages; state.sentCursor = page.nextPageToken;
  } catch (error) { if (!isAbortError(error)) state.sentError = error.message; }
  finally { if (finishRequest("sent-list", controller)) { state.sentLoading = false; render(); } }
}
