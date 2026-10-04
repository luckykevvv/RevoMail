import "./style.css";
import { applyClassifications, applyMailboxPage, outgoingProblem, replySubject, setMessageUnread } from "./mailbox-state.js";
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
  CircleAlert,
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
  CircleAlert,
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
let sentEmails = [];

const state = {
  authenticated: null,
  user: null,
  csrfToken: "",
  providers: { google: false, microsoft: false },
  accounts: [],
  authError: "",
  accountBusy: "",
  view: "inbox",
  selectedEmail: null,
  category: "All",
  priority: "All",
  readSyncNotified: false,
  classifying: false,
  classifyNote: "",
  search: "",
  theme: "light",
  voiceOpen: false,
  voiceListening: true,
  transcript: "",
  eventAdded: false,
  assignmentAdded: false,
  toast: "",
  emailsLoading: false,
  nextPageToken: null,
  aiSummary: null,
  aiSummaryLoading: false,
  aiExtraction: null,
  aiExtractionLoading: false,
  aiDraft: "",
  aiDraftLoading: false,
  aiDraftTone: "professional",
  aiInstructions: { reply: "", compose: "" },
  aiComposeLoading: false,
  compose: { to: "", subject: "", body: "" },
  returnView: "inbox",
  sentLoaded: false,
  sentLoading: false,
  sentError: "",
  sentNextPageToken: null,
  sendDraft: null,
  sendError: "",
  sending: false
};

function initialsOf(text) {
  return escapeHtml(String(text || "").split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase());
}

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `send-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
          <button class="oauth google" data-login="google" ${state.providers.google ? "" : "disabled"}><span class="provider provider-google">G</span>Continue with Google</button>
          <button class="oauth microsoft" data-login="microsoft" ${state.providers.microsoft ? "" : "disabled"}><span class="provider provider-microsoft">⊞</span>Continue with Microsoft</button>
        </div>
        ${!state.providers.google && !state.providers.microsoft ? '<p class="provider-note">Sign-in providers are not configured on this environment.</p>' : ""}
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
      <span class="account-copy"><strong>${name}</strong><small>${email}</small></span>
      <button class="icon-button" data-logout title="Sign out" aria-label="Sign out">${icon("log-out")}</button>
    </div>
  </aside>`;
}

function shell(content) {
  return `<main class="app-shell">${sidebar()}<section class="workspace">${content}</section></main>`;
}

function inboxView() {
  const firstName = escapeHtml(state.user?.displayName?.split(/\s+/)[0] || "there");
  const visible = emails.filter((email) => {
    const matchesCategory = state.category === "All" || email.category === state.category;
    const matchesPriority = state.priority === "All" || email.priority === state.priority;
    const haystack = `${email.sender} ${email.subject} ${email.preview}`.toLowerCase();
    return matchesCategory && matchesPriority && haystack.includes(state.search.toLowerCase());
  });
  return shell(`<header class="page-header">
    <div><span class="eyebrow">Good morning, ${firstName}</span><h1>Inbox</h1><p>AI has highlighted what needs your attention.</p></div>
    <button class="primary-button compose-button" data-compose>${icon("square-pen")} Compose</button>
  </header>
  <section class="inbox-toolbar">
    <label class="search-box">${icon("search")}<input id="search" type="search" placeholder="Search emails…" value="${escapeHtml(state.search)}" /><kbd>⌘ K</kbd></label>
    <button class="icon-button filter-button" title="Filter inbox">${icon("list-filter")}</button>
  </section>
  <div class="category-tabs" role="tablist">
    ${["All", "Primary", "Social", "Promotions"].map((category) => `<button class="tab ${state.category === category ? "active" : ""}" data-category="${category}">${category}</button>`).join("")}
  </div>
  ${priorityFilter()}
  <section class="mail-panel">
    <div class="mail-panel-heading"><span>${state.emailsLoading && !emails.length ? "Loading conversations" : `${visible.length} conversations`}${priorityStatus()}</span><button class="text-button" data-summarize-all ${emails.length && !state.emailsLoading ? "" : "disabled"}>${icon("sparkles")} Summarise inbox</button></div>
    <div class="email-list">
      ${state.emailsLoading && !emails.length ? '<div class="empty-state"><h3>Loading your inbox…</h3><p>Fetching messages from your connected account.</p></div>' : visible.length ? visible.map(emailRow).join("") : emails.length ? `<div class="empty-state">${icon("search-x")}<h3>No emails found</h3><p>Try a different search or category.</p></div>` : `<div class="empty-state">${icon("inbox")}<h3>Your inbox is empty</h3><p>No messages were returned by your connected account.</p></div>`}
    </div>
    ${state.nextPageToken ? `<div class="mail-panel-heading"><button class="text-button" data-load-more ${state.emailsLoading ? "disabled" : ""}>${state.emailsLoading ? "Loading…" : "Load more"}</button></div>` : ""}
  </section>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`);
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

function emailRow(email, { sent = false } = {}) {
  const person = sent ? email.to || "" : email.sender || "";
  return `<article class="email-row ${email.unread ? "unread" : "read"}" data-email="${escapeHtml(email.id)}" tabindex="0">
    <button class="check-button" aria-label="Select email"><span></span></button>
    <button class="star-button ${email.starred ? "starred" : ""}" data-star="${escapeHtml(email.id)}" aria-label="Star email">${icon("star")}</button>
    <span class="avatar avatar-sm avatar-soft">${initialsOf(person)}</span>
    <div class="email-sender"><span class="sr-only">${sent ? "Sent to " : email.unread ? "Unread. " : "Read. "}</span>${sent ? "To: " : ""}${escapeHtml(person)}</div>
    <div class="email-content">${sent ? "" : priorityBadge(email)}<strong>${escapeHtml(email.subject)}</strong><span>${escapeHtml(email.preview)}</span></div>
    <time>${escapeHtml(email.time || email.date || "")}</time>
    ${email.unread ? '<span class="unread-dot" role="img" aria-label="Unread"></span>' : ""}
  </article>`;
}

function readingView() {
  const email = state.selectedEmail;
  const plainBody = escapeHtml(email.body_plain || email.preview || "").replaceAll("\n", "<br />");
  const messageBody = email._loading ? "<p>Loading email…</p>" : email.body_html || `<p>${plainBody}</p>`;
  const summary = state.aiSummary;
  const extraction = state.aiExtraction;
  return shell(`<header class="compact-header">
    <button class="back-button" data-nav="${state.returnView}">${icon("arrow-left")}</button>
    <div><span class="eyebrow">${state.returnView === "sent" ? "Sent" : "Inbox / Primary"}</span><h1>${escapeHtml(email.subject)}</h1></div>
    <div class="header-actions"><button class="icon-button" title="Archive">${icon("archive")}</button><button class="icon-button" title="Delete">${icon("trash-2")}</button><button class="icon-button" title="More">${icon("ellipsis")}</button></div>
  </header>
  <div class="reading-grid">
    <article class="message-card">
      <div class="message-from"><span class="avatar">${initialsOf(email.sender)}</span><div><strong>${escapeHtml(email.sender)}</strong><small>${escapeHtml(email.to || email.address || "")}</small></div><time>${escapeHtml(email.time || email.date || "")}</time><button class="star-button">${icon("star")}</button></div>
      <div class="message-body">${messageBody}</div>
      <div class="message-actions"><button class="secondary-button" data-reply ${email._loading ? "disabled" : ""}>${icon("reply")} Reply</button><button class="secondary-button">${icon("reply-all")} Reply all</button><button class="secondary-button">${icon("forward")} Forward</button></div>
    </article>
    <aside class="ai-rail">
      <section class="insight-card summary-card"><div class="insight-title"><span>${icon("sparkles")}</span><div><small>REVO AI</small><h2>Summary</h2></div>${summary ? "" : `<button class="text-button" data-ai-summarise ${state.aiSummaryLoading ? "disabled" : ""}>${state.aiSummaryLoading ? "Generating…" : "Summarise"}</button>`}</div>${summary ? `<p>${escapeHtml(summary.summary)}</p><ul>${(summary.bullets || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>${state.aiSummaryLoading ? "Summarising…" : "Generate a summary for this email."}</p>`}</section>
      <section class="insight-card"><div class="insight-title"><span>${icon("scan-text")}</span><div><small>EXTRACTED</small><h2>Key details</h2></div>${extraction ? "" : `<button class="text-button" data-ai-extract ${state.aiExtractionLoading ? "disabled" : ""}>${state.aiExtractionLoading ? "Extracting…" : "Extract"}</button>`}</div>${extraction ? renderExtraction(extraction) : `<p>${state.aiExtractionLoading ? "Extracting details…" : "Extract tasks and events from this email."}</p>`}</section>
    </aside>
  </div>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`);
}

function renderExtraction(extraction) {
  const events = (extraction.events || []).map((event) => `<li><strong>${escapeHtml(event.title || "Event")}</strong> ${escapeHtml([event.date, event.time, event.location].filter(Boolean).join(" · "))}</li>`);
  const tasks = (extraction.tasks || []).map((task) => `<li><strong>${escapeHtml(task.title || "Task")}</strong> ${escapeHtml(task.due_date || "")}</li>`);
  const items = [...events, ...tasks];
  return items.length ? `<ul>${items.join("")}</ul>` : "<p>No explicit tasks or events were found.</p>";
}

// The "tell Revo AI what to write" box shared by the reply and compose screens. Typing is kept in state;
// nothing is generated until the user presses the button, and nothing is ever sent from here.
function aiPromptPanel(mode) {
  const reply = mode === "reply";
  const loading = reply ? state.aiDraftLoading : state.aiComposeLoading;
  const hasDraft = Boolean((reply ? state.aiDraft : state.compose.body).trim());
  const hasInstructions = Boolean(state.aiInstructions[mode].trim());
  const label = loading ? "Writing…" : !hasDraft ? "Generate draft" : reply && !hasInstructions ? "Regenerate" : "Update draft";
  const placeholder = reply ? "e.g. Say yes, but ask if we can move it to 11am" : "e.g. Ask Sam to send the Q3 report by Friday";
  const hint = hasDraft ? "Your instructions are applied to the draft below. Choose a tone, then update." : "Describe what you want to say, choose a tone, then generate a draft you can edit.";
  return `<section class="ai-prompt" aria-label="Revo AI writing assistant">
    <label for="ai-instructions"><span>${icon("sparkles")} Tell Revo AI what to write</span></label>
    <textarea id="ai-instructions" rows="2" maxlength="1000" placeholder="${placeholder}">${escapeHtml(state.aiInstructions[mode])}</textarea>
    <div class="ai-prompt-row">
      <div class="tone-row" role="group" aria-label="Tone"><span>Tone</span>${["professional", "concise", "friendly"].map((tone) => `<button class="tone-chip ${state.aiDraftTone === tone ? "active" : ""}" data-tone="${tone}" aria-pressed="${state.aiDraftTone === tone}">${tone[0].toUpperCase() + tone.slice(1)}</button>`).join("")}</div>
      <button class="primary-button" data-ai-generate="${mode}" ${loading ? "disabled" : ""}>${icon("sparkles")} ${label}</button>
    </div>
    <small>${hint} Nothing is sent until you confirm.</small>
  </section>`;
}

function replyView() {
  const email = state.selectedEmail;
  const recipients = Array.isArray(email.reply_to) ? email.reply_to : [];
  const draft = state.aiDraft;
  return shell(`<header class="compact-header">
    <button class="back-button" data-view="reading">${icon("arrow-left")}</button>
    <div><span class="eyebrow">AI generated · review before sending</span><h1>Reply draft</h1></div>
    <button class="secondary-button" data-regenerate>${icon("refresh-cw")} Regenerate</button>
  </header>
  <section class="composer-card">
    <div class="field-row"><label>To</label><div class="input-shell">${recipients.length ? `<span class="avatar avatar-xs">${initialsOf(recipients[0])}</span> ${escapeHtml(recipients.join(", "))}` : "No reply address found for this message"}</div></div>
    <div class="field-row"><label>Subject</label><div class="input-shell">${escapeHtml(replySubject(email.subject))}</div></div>
    ${aiPromptPanel("reply")}
    <div class="ai-draft-label"><span>${icon("sparkles")} Reply draft</span><small>Edit as needed</small></div>
    ${state.aiDraftLoading ? '<div class="reply-editor">Generating draft…</div>' : `<textarea id="reply-text" class="reply-editor" placeholder="Write your reply…">${escapeHtml(draft)}</textarea>`}
    <div class="composer-footer"><div class="compose-tools"><button class="icon-button">${icon("paperclip")}</button><button class="icon-button">${icon("smile")}</button><button class="icon-button">${icon("image")}</button><button class="icon-button" data-voice>${icon("mic")}</button></div><div><button class="secondary-button" data-discard>Discard</button><button class="primary-button" data-send ${state.aiDraftLoading || !recipients.length ? "disabled" : ""}>${icon("send")} Review &amp; send</button></div></div>
  </section>`);
}

function tasksView(calendarOnly = false) {
  return shell(`<header class="page-header">
    <div><span class="eyebrow">AI extracted from your email</span><h1>${calendarOnly ? "Calendar" : "Tasks & events"}</h1><p>${calendarOnly ? "A focused view of upcoming email commitments." : "Turn commitments into action without copy and paste."}</p></div>
    <button class="primary-button">${icon("plus")} Add manually</button>
  </header>
  <div class="task-tabs"><button class="tab ${calendarOnly ? "" : "active"}" data-nav="tasks">Tasks <span>1</span></button><button class="tab ${calendarOnly ? "active" : ""}" data-nav="calendar">Events <span>1</span></button></div>
  <section class="task-grid">
    <article class="task-card event-card"><div class="task-icon">${icon("calendar-days")}</div><div class="task-copy"><span class="task-type">EVENT · TOMORROW</span><h2>Project Meeting</h2><dl><div><dt>Date</dt><dd>May 15, 2025</dd></div><div><dt>Time</dt><dd>10:00 AM – 11:00 AM</dd></div><div><dt>Location</dt><dd>Room 302</dd></div><div><dt>Organiser</dt><dd>Prof. Smith</dd></div></dl><button class="${state.eventAdded ? "success-button" : "secondary-button"}" data-add-event>${icon(state.eventAdded ? "check" : "calendar-plus")} ${state.eventAdded ? "Added to calendar" : "Add to calendar"}</button></div></article>
    <article class="task-card"><div class="task-icon amber">${icon("square-check-big")}</div><div class="task-copy"><span class="task-type">TASK · UNIVERSITY</span><h2>Submit Assignment 2</h2><dl><div><dt>Due</dt><dd>May 20, 2025 · 11:59 PM</dd></div><div><dt>Source</dt><dd>Course Update</dd></div></dl><button class="${state.assignmentAdded ? "success-button" : "secondary-button"}" data-add-assignment>${icon(state.assignmentAdded ? "check" : "calendar-plus")} ${state.assignmentAdded ? "Added to calendar" : "Add to calendar"}</button></div></article>
  </section>
  <div class="ai-footnote">${icon("sparkles")} AI extracted these items from your emails. Always check important details.</div>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`);
}

function settingsView() {
  return shell(`<header class="page-header"><div><span class="eyebrow">Personal workspace</span><h1>Settings</h1><p>Customise your RevoMail assistant experience.</p></div><span class="saved-status">${icon("circle-check")} Changes save automatically</span></header>
  <section class="settings-stack">
    ${connectedAccountsGroup()}
    ${settingGroup("General", "settings", `
      ${selectSetting("Language", "languages", ["English", "简体中文", "Español"])}
      <div class="setting-row"><div class="setting-name">${icon("sun-moon")}<span><strong>Theme</strong><small>Choose your preferred appearance</small></span></div><div class="segmented"><button class="${state.theme === "light" ? "active" : ""}" data-theme="light">${icon("sun")} Light</button><button class="${state.theme === "dark" ? "active" : ""}" data-theme="dark">${icon("moon")} Dark</button></div></div>`)}
    ${settingGroup("AI preferences", "sparkles", `
      ${selectSetting("Default AI model", "cpu", ["GPT-4o (OpenAI)", "Gemini 2.5 Pro", "Claude Sonnet"])}
      ${selectSetting("Response length", "align-left", ["Concise", "Medium", "Detailed"])}
      <div class="setting-row"><div class="setting-name">${icon("shield-check")}<span><strong>Human review</strong><small>Require confirmation before sending</small></span></div><button class="toggle active" role="switch" aria-checked="true"><span></span></button></div>`)}
    ${settingGroup("Voice", "mic", `
      ${selectSetting("Speech-to-text language", "captions", ["English (US)", "English (AU)", "简体中文"])}
      <div class="setting-row"><div class="setting-name">${icon("audio-waveform")}<span><strong>Voice input</strong><small>Enable spoken inbox commands</small></span></div><button class="toggle active" role="switch" aria-checked="true"><span></span></button></div>`)}
    <section class="about-card"><div>${logo()}<p>AI-powered email that helps you write, manage and organise more efficiently.</p></div><span>Prototype v0.1</span></section>
  </section>`);
}

function connectedAccountsGroup() {
  const content = state.accounts.length ? state.accounts.map((account) => {
    const provider = account.provider === "google" ? "Google" : "Microsoft";
    const busy = state.accountBusy === account.id;
    return `<article class="connected-account">
      <div class="account-provider"><span class="provider ${account.provider === "google" ? "provider-google" : "provider-microsoft"}">${account.provider === "google" ? "G" : "⊞"}</span><span><strong>${provider}</strong><small>${escapeHtml(account.email)}</small></span></div>
      <span class="connection-status ${account.status.toLowerCase()}">${escapeHtml(account.status.replaceAll("_", " "))}</span>
      <details><summary>Granted permissions</summary><ul>${account.scopes.map((scope) => `<li>${escapeHtml(scope)}</li>`).join("")}</ul></details>
      <div class="account-actions"><button class="secondary-button" data-reauthorize="${account.id}" ${busy ? "disabled" : ""}>Reconnect</button><button class="danger-button" data-disconnect="${account.id}" data-provider-name="${provider}" data-account-email="${escapeHtml(account.email)}" ${busy ? "disabled" : ""}>Disconnect</button></div>
    </article>`;
  }).join("") : '<div class="empty-account"><p>No connected accounts.</p><p>Sign out, then connect Google or Microsoft from the sign-in page.</p></div>';
  return settingGroup("Connected accounts", "shield-check", `<div class="connected-account-list">${content}<div class="session-actions"><span><strong>RevoMail session</strong><small>Signing out keeps provider access connected until you disconnect it above.</small></span><button class="secondary-button" data-logout>${icon("log-out")} Sign out of RevoMail</button></div></div>`);
}

function settingGroup(title, groupIcon, content) {
  return `<section class="setting-group"><h2>${icon(groupIcon)} ${title}</h2>${content}</section>`;
}

function selectSetting(label, settingIcon, values) {
  return `<label class="setting-row"><div class="setting-name">${icon(settingIcon)}<span><strong>${label}</strong><small>Set your default preference</small></span></div><select>${values.map((value) => `<option>${value}</option>`).join("")}</select></label>`;
}

function composeView() {
  return shell(`<header class="compact-header"><button class="back-button" data-nav="inbox">${icon("arrow-left")}</button><div><span class="eyebrow">New message</span><h1>Compose</h1></div></header>
  <section class="composer-card compose-new"><div class="field-row"><label>To</label><input id="compose-to" class="input-shell" placeholder="Recipient" value="${escapeHtml(state.compose.to)}" /></div><div class="field-row"><label>Subject</label><input id="compose-subject" class="input-shell" placeholder="Email subject" value="${escapeHtml(state.compose.subject)}" /></div>${aiPromptPanel("compose")}<textarea id="compose-body" class="reply-editor" ${state.aiComposeLoading ? "disabled" : ""} placeholder="${state.aiComposeLoading ? "Revo AI is writing…" : "Write a message, or describe it above and let Revo AI draft it…"}">${escapeHtml(state.compose.body)}</textarea><div class="composer-footer"><div class="compose-tools"><button class="icon-button">${icon("paperclip")}</button><button class="icon-button">${icon("smile")}</button><button class="icon-button" data-voice>${icon("mic")}</button></div><button class="primary-button" data-send ${state.aiComposeLoading ? "disabled" : ""}>${icon("send")} Review &amp; send</button></div></section>`);
}

function sentView() {
  const loading = state.sentLoading && !sentEmails.length;
  const list = loading
    ? '<div class="empty-state"><h3>Loading sent mail…</h3><p>Fetching messages from your connected account.</p></div>'
    : state.sentError && !sentEmails.length
      ? `<div class="empty-state">${icon("circle-alert")}<h3>Sent mail could not be loaded</h3><p>${escapeHtml(state.sentError)}</p><button class="secondary-button" data-sent-refresh>Try again</button></div>`
      : sentEmails.length
        ? sentEmails.map((email) => emailRow(email, { sent: true })).join("")
        : `<div class="empty-state">${icon("send")}<h3>No sent messages</h3><p>Messages you send will appear here.</p></div>`;
  return shell(`<header class="page-header">
    <div><span class="eyebrow">Mailbox</span><h1>Sent</h1><p>Messages you have sent, including replies sent from RevoMail.</p></div>
    <button class="primary-button compose-button" data-compose>${icon("square-pen")} Compose</button>
  </header>
  <section class="mail-panel">
    <div class="mail-panel-heading"><span>${loading ? "Loading sent mail" : `${sentEmails.length} sent`}</span><button class="text-button" data-sent-refresh ${state.sentLoading ? "disabled" : ""}>${icon("refresh-cw")} Refresh</button></div>
    <div class="email-list">${list}</div>
    ${state.sentNextPageToken ? `<div class="mail-panel-heading"><button class="text-button" data-sent-more ${state.sentLoading ? "disabled" : ""}>${state.sentLoading ? "Loading…" : "Load more"}</button></div>` : ""}
  </section>`);
}

function sendConfirmModal() {
  const draft = state.sendDraft;
  if (!draft) return "";
  return `<div class="modal-backdrop" role="presentation"><section class="send-modal" role="dialog" aria-modal="true" aria-labelledby="send-title">
    <div class="modal-header"><div><span class="eyebrow">CONFIRM</span><h2 id="send-title">Send this email?</h2></div></div>
    <dl class="send-summary">
      <dt>To</dt><dd>${escapeHtml(draft.to)}</dd>
      <dt>Subject</dt><dd>${escapeHtml(draft.subject) || "(no subject)"}</dd>
    </dl>
    <div class="send-body">${escapeHtml(draft.body)}</div>
    ${state.sendError ? `<p class="send-error" role="alert">${escapeHtml(state.sendError)}</p>` : ""}
    <div class="modal-footer"><button class="secondary-button" data-cancel-send ${state.sending ? "disabled" : ""}>Cancel</button><button class="primary-button" data-confirm-send ${state.sending ? "disabled" : ""}>${icon("send")} ${state.sending ? "Sending…" : state.sendError ? "Try again" : "Send now"}</button></div>
  </section></div>`;
}

function placeholderView(title, navIcon) {
  return shell(`<header class="page-header"><div><span class="eyebrow">Mailbox</span><h1>${title}</h1><p>Your ${title.toLowerCase()} messages live here.</p></div></header><div class="placeholder-card">${icon(navIcon)}<h2>${title} is ready</h2><p>This demo focuses on the AI-assisted inbox flow from the presentation mock.</p><button class="secondary-button" data-nav="inbox">Back to inbox</button></div>`);
}

function voiceModal() {
  if (!state.voiceOpen) return "";
  return `<div class="modal-backdrop" role="presentation"><section class="voice-modal" role="dialog" aria-modal="true" aria-labelledby="voice-title">
    <div class="modal-header"><div><span class="eyebrow">VOICE COMMAND</span><h2 id="voice-title">What can RevoMail do?</h2></div><button class="icon-button" data-close-voice>${icon("x")}</button></div>
    <button class="voice-orb ${state.voiceListening ? "listening" : ""}" data-toggle-listening>${icon(state.voiceListening ? "mic" : "mic-off")}</button>
    <strong class="listening-label">${state.voiceListening ? "Listening…" : "Paused"}</strong>
    <div class="waveform" aria-hidden="true">${Array.from({ length: 29 }, (_, index) => `<span style="--i:${index}"></span>`).join("")}</div>
    <div class="transcript-box">${state.transcript || "Try: “Summarise the email from Prof. Smith and extract the meeting time.”"}</div>
    <div class="voice-hints"><button data-command="Summarise my newest email">Summarise newest email</button><button data-command="Show my extracted tasks">Show my tasks</button></div>
    <div class="modal-footer"><select><option>English (US)</option><option>English (AU)</option></select><button class="primary-button" data-run-command ${state.transcript ? "" : "disabled"}>Run command ${icon("arrow-right")}</button></div>
  </section></div>`;
}

function toast() {
  return state.toast ? `<div class="toast">${icon("circle-check")}<span>${state.toast}</span></div>` : "";
}

function render() {
  document.body.dataset.theme = state.theme;
  if (state.authenticated === null) {
    app.innerHTML = `<main class="loading-page" aria-live="polite"><div class="brand-mark">${icon("mail")}</div><p>Checking your secure session…</p></main>`;
  } else if (!state.authenticated) {
    app.innerHTML = renderLogin() + toast();
  } else {
    let content;
    if (state.view === "inbox") content = inboxView();
    else if (state.view === "reading") content = readingView();
    else if (state.view === "reply") content = replyView();
    else if (state.view === "tasks") content = tasksView();
    else if (state.view === "calendar") content = tasksView(true);
    else if (state.view === "settings") content = settingsView();
    else if (state.view === "compose") content = composeView();
    else if (state.view === "starred") content = placeholderView("Starred", "star");
    else if (state.view === "drafts") content = placeholderView("Drafts", "file");
    else content = sentView();
    app.innerHTML = content + voiceModal() + sendConfirmModal() + toast();
  }
  createIcons({ icons: demoIcons });
  bindEvents();
}

let toastTimer;
let voiceTimer;
function showToast(message) {
  state.toast = message;
  clearTimeout(toastTimer);
  render();
  toastTimer = setTimeout(() => { state.toast = ""; render(); }, 2600);
}

function openVoice() {
  state.voiceOpen = true;
  state.voiceListening = true;
  state.transcript = "";
  render();
  clearTimeout(voiceTimer);
  voiceTimer = setTimeout(() => {
    if (!state.voiceOpen || !state.voiceListening) return;
    state.transcript = "Please summarise the email from Prof. Smith and extract the meeting time.";
    state.voiceListening = false;
    render();
  }, 1800);
}

function bindEvents() {
  document.querySelectorAll("[data-login]").forEach((button) => button.addEventListener("click", () => {
    button.disabled = true;
    button.lastChild.textContent = " Redirecting…";
    window.location.assign(`/api/v1/auth/${button.dataset.login}/start?returnTo=${encodeURIComponent(window.location.pathname)}`);
  }));
  document.querySelector("[data-clear-auth-error]")?.addEventListener("click", () => { state.authError = ""; render(); });
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", async () => {
    try { await api("/api/v1/auth/logout", { method: "POST" }); } catch (error) { showToast(error.message); return; }
    state.authenticated = false; state.user = null; state.csrfToken = ""; state.accounts = []; state.view = "inbox"; resetMailbox(); resetOutgoing(); render();
  }));
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.nav;
    if (state.view === "sent" && !state.sentLoaded && !state.sentLoading) void fetchSent();
    else render();
  }));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
  document.querySelectorAll("[data-email]").forEach((row) => row.addEventListener("click", async (event) => {
    if (event.target.closest("button")) return;
    const fromSent = state.view === "sent";
    const selected = (fromSent ? sentEmails : emails).find((email) => String(email.id) === row.dataset.email);
    if (!selected) return;
    state.returnView = fromSent ? "sent" : "inbox";
    state.aiSummary = null;
    state.aiExtraction = null;
    state.aiDraft = "";
    state.aiInstructions.reply = "";
    state.selectedEmail = { ...selected, _loading: !selected.body_plain && !selected.body_html };
    state.selectedEmail.unread = false;
    const wasUnread = selected.unread;
    if (wasUnread) emails = setMessageUnread(emails, selected.id, false);
    state.view = "reading";
    render();
    if (wasUnread) void syncReadState(selected.id);
    if (!state.selectedEmail._loading) return;
    try {
      state.selectedEmail = { ...(await api(`/api/v1/emails/${encodeURIComponent(selected.id)}`)), unread: false };
      render();
    } catch (error) {
      state.selectedEmail._loading = false;
      showToast(error.message);
    }
  }));
  document.querySelectorAll("[data-star]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const email = emails.find((item) => String(item.id) === button.dataset.star); if (email) email.starred = !email.starred; render(); }));
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelectorAll("[data-priority]").forEach((button) => button.addEventListener("click", () => { state.priority = button.dataset.priority; render(); }));
  document.querySelector("#search")?.addEventListener("input", (event) => { state.search = event.target.value; render(); document.querySelector("#search")?.focus(); });
  document.querySelector("[data-compose]")?.addEventListener("click", () => { state.view = "compose"; render(); });
  document.querySelector("[data-reply]")?.addEventListener("click", () => { state.view = "reply"; if (!state.aiDraft) void aiDraftReply(); else render(); });
  document.querySelector("[data-regenerate]")?.addEventListener("click", () => void aiDraftReply({ fresh: true }));
  // Choosing a tone only selects it; the draft changes when the user presses Generate/Update.
  document.querySelectorAll("[data-tone]").forEach((button) => button.addEventListener("click", () => { state.aiDraftTone = button.dataset.tone; render(); }));
  document.querySelector("#ai-instructions")?.addEventListener("input", (event) => { state.aiInstructions[state.view === "reply" ? "reply" : "compose"] = event.target.value; });
  document.querySelector("#ai-instructions")?.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) document.querySelector("[data-ai-generate]")?.click(); });
  document.querySelector("[data-ai-generate]")?.addEventListener("click", (event) => {
    if (event.currentTarget.dataset.aiGenerate === "reply") void aiDraftReply();
    else void aiCompose();
  });
  document.querySelector("[data-discard]")?.addEventListener("click", () => { state.view = "reading"; render(); });
  // Keep what the user types in state so a re-render (toast, dialog, loading) never wipes it.
  document.querySelector("#reply-text")?.addEventListener("input", (event) => { state.aiDraft = event.target.value; });
  document.querySelector("#compose-to")?.addEventListener("input", (event) => { state.compose.to = event.target.value; });
  document.querySelector("#compose-subject")?.addEventListener("input", (event) => { state.compose.subject = event.target.value; });
  document.querySelector("#compose-body")?.addEventListener("input", (event) => { state.compose.body = event.target.value; });
  document.querySelectorAll("[data-send]").forEach((button) => button.addEventListener("click", () => openSendConfirmation()));
  document.querySelector("[data-cancel-send]")?.addEventListener("click", () => { if (state.sending) return; state.sendDraft = null; state.sendError = ""; render(); });
  document.querySelector("[data-confirm-send]")?.addEventListener("click", () => void submitSend());
  document.querySelectorAll("[data-sent-refresh]").forEach((button) => button.addEventListener("click", () => void fetchSent()));
  document.querySelector("[data-sent-more]")?.addEventListener("click", () => void fetchSent(state.sentNextPageToken));
  document.querySelector("[data-summarize-all]")?.addEventListener("click", () => showToast(`${emails.length} emails ready to summarise`));
  document.querySelector("[data-load-more]")?.addEventListener("click", () => void fetchEmails(state.nextPageToken));
  document.querySelector("[data-ai-summarise]")?.addEventListener("click", () => void aiSummarise());
  document.querySelector("[data-ai-extract]")?.addEventListener("click", () => void aiExtract());
  document.querySelectorAll("[data-add-event]").forEach((button) => button.addEventListener("click", () => { state.eventAdded = true; showToast("Project Meeting added to calendar"); }));
  document.querySelector("[data-add-assignment]")?.addEventListener("click", () => { state.assignmentAdded = true; showToast("Assignment deadline added to calendar"); });
  // Scope to buttons: render() also sets data-theme on <body>, which never gets replaced, so an unscoped
  // selector attached a new click->render() listener to <body> on every render (exponential slowdown).
  document.querySelectorAll("button[data-theme]").forEach((button) => button.addEventListener("click", () => { state.theme = button.dataset.theme; render(); }));
  document.querySelectorAll(".toggle").forEach((button) => button.addEventListener("click", () => { button.classList.toggle("active"); button.setAttribute("aria-checked", button.classList.contains("active")); }));
  document.querySelectorAll("[data-disconnect]").forEach((button) => button.addEventListener("click", async () => {
    const confirmed = window.confirm(`Disconnect ${button.dataset.providerName} account ${button.dataset.accountEmail}? RevoMail will revoke provider access where supported and permanently remove its stored credentials and active connection.`);
    if (!confirmed) return;
    state.accountBusy = button.dataset.disconnect; render();
    try { await api(`/api/v1/accounts/${button.dataset.disconnect}`, { method: "DELETE" }); await loadAccounts(); showToast("Account disconnected and local credentials removed"); }
    catch (error) { state.accountBusy = ""; showToast(error.message); }
  }));
  document.querySelectorAll("[data-reauthorize]").forEach((button) => button.addEventListener("click", async () => {
    state.accountBusy = button.dataset.reauthorize; render();
    try { const result = await api(`/api/v1/accounts/${button.dataset.reauthorize}/reauthorize`, { method: "POST" }); window.location.assign(result.authorizationUrl); }
    catch (error) { state.accountBusy = ""; showToast(error.message); }
  }));
  document.querySelectorAll("[data-voice]").forEach((button) => button.addEventListener("click", openVoice));
  document.querySelector("[data-close-voice]")?.addEventListener("click", () => { state.voiceOpen = false; clearTimeout(voiceTimer); render(); });
  document.querySelector(".modal-backdrop")?.addEventListener("click", (event) => { if (event.target.classList.contains("modal-backdrop")) { state.voiceOpen = false; clearTimeout(voiceTimer); render(); } });
  document.querySelector("[data-toggle-listening]")?.addEventListener("click", () => { state.voiceListening = !state.voiceListening; render(); });
  document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => { state.transcript = button.dataset.command; state.voiceListening = false; render(); }));
  document.querySelector("[data-run-command]")?.addEventListener("click", () => { state.voiceOpen = false; state.view = state.transcript.toLowerCase().includes("task") ? "tasks" : "reading"; showToast("Voice command completed"); });
}

// The row is already shown as read (optimistic). Tell Gmail; if that fails, put the row back to unread so
// RevoMail never claims a state that Gmail does not have.
async function syncReadState(id) {
  try {
    await api(`/api/v1/emails/${encodeURIComponent(id)}/read`, { method: "POST" });
  } catch (error) {
    emails = setMessageUnread(emails, id, true);
    let message = "";
    if (error.code === "INSUFFICIENT_PERMISSIONS") {
      if (!state.readSyncNotified) message = error.message; // explain once per session; later failures just stay unread
      state.readSyncNotified = true;
    } else {
      message = "Could not mark the email as read in Gmail.";
    }
    if (message) showToast(message);
    else render();
  }
}

async function fetchEmails(pageToken = null) {
  if (!pageToken) resetMailbox();
  state.emailsLoading = true;
  render();
  try {
    const query = new URLSearchParams({ max_results: "20" });
    if (pageToken) query.set("page_token", pageToken);
    const payload = await api(`/api/v1/emails?${query}`);
    const mailbox = applyMailboxPage(emails, payload, { append: Boolean(pageToken) });
    emails = mailbox.messages;
    state.nextPageToken = mailbox.nextPageToken;
    if (!pageToken) state.selectedEmail = mailbox.selectedMessage;
    void classifyEmails(payload?.messages || []);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.emailsLoading = false;
    render();
  }
}

async function fetchSent(pageToken = null) {
  if (state.sentLoading) return;
  if (!pageToken) { sentEmails = []; state.sentNextPageToken = null; }
  state.sentLoading = true;
  state.sentError = "";
  render();
  try {
    const query = new URLSearchParams({ max_results: "20", label: "SENT" });
    if (pageToken) query.set("page_token", pageToken);
    const payload = await api(`/api/v1/emails?${query}`);
    const page = applyMailboxPage(sentEmails, payload, { append: Boolean(pageToken) });
    sentEmails = page.messages;
    state.sentNextPageToken = page.nextPageToken;
    state.sentLoaded = true;
  } catch (error) {
    state.sentError = error.message;
  } finally {
    state.sentLoading = false;
    render();
  }
}

// Step 1 of sending: validate and show the recipients, subject and body for the user to confirm.
// Nothing is sent until they press "Send now" in the dialog.
function openSendConfirmation() {
  const isReply = state.view === "reply";
  const email = state.selectedEmail;
  const draft = isReply
    ? { isReply, to: (email?.reply_to || []).join(", "), subject: replySubject(email?.subject), body: state.aiDraft, replyToMessageId: String(email?.id || "") }
    : { isReply, to: state.compose.to.trim(), subject: state.compose.subject.trim(), body: state.compose.body, replyToMessageId: null };
  const problem = outgoingProblem({ isReply, to: draft.to, replyTo: email?.reply_to, body: draft.body });
  if (problem) { showToast(problem); return; }
  state.sendDraft = { ...draft, idempotencyKey: newIdempotencyKey() };
  state.sendError = "";
  render();
}

// Step 2: the user confirmed. The idempotency key stays the same across retries of this dialog, so a
// retry after a lost response cannot send the message twice.
async function submitSend() {
  const draft = state.sendDraft;
  if (!draft || state.sending) return;
  state.sending = true;
  state.sendError = "";
  render();
  try {
    await api("/api/v1/emails/send", {
      method: "POST",
      body: JSON.stringify({
        to: draft.isReply ? null : draft.to,
        subject: draft.subject,
        body: draft.body,
        replyToMessageId: draft.isReply ? draft.replyToMessageId : null,
        confirmed: true,
        idempotencyKey: draft.idempotencyKey
      })
    });
  } catch (error) {
    state.sending = false;
    state.sendError = error.message;
    render();
    return;
  }
  state.sending = false;
  state.sendDraft = null;
  if (draft.isReply) { state.aiDraft = ""; state.aiInstructions.reply = ""; }
  else { state.compose = { to: "", subject: "", body: "" }; state.aiInstructions.compose = ""; }
  state.sentLoaded = false;
  state.view = "sent";
  showToast("Message sent");
  void fetchSent();
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

// Clears everything tied to the signed-in account (sent mail, unsent drafts, open dialogs).
function resetOutgoing() {
  sentEmails = [];
  state.sentLoaded = false;
  state.sentNextPageToken = null;
  state.sentError = "";
  state.sendDraft = null;
  state.sendError = "";
  state.sending = false;
  state.compose = { to: "", subject: "", body: "" };
  state.aiInstructions = { reply: "", compose: "" };
  state.aiComposeLoading = false;
}

function resetMailbox() {
  emails = [];
  state.priority = "All";
  state.classifyNote = "";
  state.selectedEmail = null;
  state.nextPageToken = null;
  state.aiSummary = null;
  state.aiExtraction = null;
  state.aiDraft = "";
}

async function aiSummarise() {
  if (!state.selectedEmail) return;
  state.aiSummaryLoading = true;
  render();
  try {
    state.aiSummary = await api("/api/v1/ai/summarise", { method: "POST", body: JSON.stringify({ message_id: String(state.selectedEmail.id) }) });
  } catch (error) {
    showToast(error.message);
  } finally {
    state.aiSummaryLoading = false;
    render();
  }
}

async function aiExtract() {
  if (!state.selectedEmail) return;
  state.aiExtractionLoading = true;
  render();
  try {
    state.aiExtraction = await api("/api/v1/ai/extract", { method: "POST", body: JSON.stringify({ message_id: String(state.selectedEmail.id) }) });
  } catch (error) {
    showToast(error.message);
  } finally {
    state.aiExtractionLoading = false;
    render();
  }
}

// Writes the reply draft. With instructions typed and a draft present, the draft is revised according to
// them; `fresh` (the header Regenerate button) and an empty instructions box write a new draft instead.
async function aiDraftReply({ fresh = false } = {}) {
  if (!state.selectedEmail) return;
  const emailId = String(state.selectedEmail.id);
  const instructions = state.aiInstructions.reply.trim();
  const currentDraft = !fresh && instructions ? state.aiDraft : "";
  state.aiDraftLoading = true;
  render();
  try {
    const payload = await api("/api/v1/ai/draft-reply", {
      method: "POST",
      body: JSON.stringify({ message_id: emailId, tone: state.aiDraftTone, instructions, current_draft: currentDraft })
    });
    // Ignore the result if the user opened a different email while this was running.
    if (String(state.selectedEmail?.id) === emailId) state.aiDraft = payload.draft;
  } catch (error) {
    showToast(error.message);
  } finally {
    state.aiDraftLoading = false;
    render();
  }
}

// Writes (or revises) a new message from the instructions box. The subject is only filled in if still empty.
async function aiCompose() {
  const instructions = state.aiInstructions.compose.trim();
  if (!instructions) { showToast("Tell Revo AI what to write first"); return; }
  state.aiComposeLoading = true;
  render();
  try {
    const result = await api("/api/v1/ai/compose", {
      method: "POST",
      body: JSON.stringify({ instructions, tone: state.aiDraftTone, subject: state.compose.subject.trim(), current_draft: state.compose.body })
    });
    if (result.draft) state.compose.body = result.draft;
    if (!state.compose.subject.trim() && result.subject) state.compose.subject = result.subject;
  } catch (error) {
    showToast(error.message);
  } finally {
    state.aiComposeLoading = false;
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
    INSUFFICIENT_PERMISSIONS: "The required mailbox or calendar permissions were not granted.",
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
      if (requestedView === "settings") state.view = "settings";
      const accounts = await api("/api/v1/accounts");
      state.accounts = accounts.accounts;
      if (state.accounts.length) await fetchEmails();
      else resetMailbox();
    }
  } catch (error) {
    state.authenticated = false;
    state.authError ||= "RevoMail could not check provider availability.";
  }
  render();
}

render();
bootstrap();
