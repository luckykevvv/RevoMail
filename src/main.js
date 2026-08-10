import "./style.css";
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

let emails = [
  {
    id: 1,
    sender: "Prof. Smith",
    address: "smith@university.edu",
    subject: "Project Meeting Tomorrow",
    preview: "Just a reminder that we will have our project meeting tomorrow…",
    time: "10:30 AM",
    category: "Primary",
    unread: true,
    starred: false,
    body: [
      "Hi team,",
      "Just a reminder that we will have our project meeting tomorrow at 10:00 AM in Room 302.",
      "Please prepare the progress update and any blockers you would like to discuss.",
      "Best,\nProf. Smith"
    ]
  },
  { id: 2, sender: "Marketing Team", address: "news@revomail.example", subject: "Weekly Newsletter", preview: "Here is this week’s update on campaigns and product launches…", time: "9:15 AM", category: "Promotions", unread: true, starred: false },
  { id: 3, sender: "service@github.com", address: "service@github.com", subject: "Security alert", preview: "A new sign-in to your GitHub account was detected…", time: "Yesterday", category: "Primary", unread: false, starred: true },
  { id: 4, sender: "Alice Chen", address: "alice.chen@example.com", subject: "Lunch Invitation", preview: "Would you like to join lunch this Friday? I found a great place…", time: "Yesterday", category: "Social", unread: false, starred: false },
  { id: 5, sender: "no-reply@university.edu", address: "no-reply@university.edu", subject: "Course Update", preview: "The deadline for assignment 2 has been confirmed…", time: "May 12", category: "Primary", unread: false, starred: false },
  { id: 6, sender: "HR Department", address: "careers@example.com", subject: "New Internship Opportunity", preview: "Please find attached the details of the winter internship…", time: "May 11", category: "Promotions", unread: false, starred: false }
];

const state = {
  authenticated: null,
  user: null,
  csrfToken: "",
  providers: { google: false, microsoft: false },
  accounts: [],
  authError: "",
  accountBusy: "",
  view: "inbox",
  selectedEmail: emails[0],
  category: "All",
  search: "",
  theme: "light",
  voiceOpen: false,
  voiceListening: true,
  transcript: "",
  replyVersion: 0,
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

const navItems = [
  ["inbox", "Inbox", "inbox"],
  ["starred", "Starred", "star"],
  ["drafts", "Drafts", "file"],
  ["sent", "Sent", "send"],
  ["tasks", "Tasks", "square-check-big"],
  ["calendar", "Calendar", "calendar-days"],
  ["settings", "Settings", "settings"]
];

const replies = [
  "Hi Prof. Smith,\n\nThank you for the reminder. I will attend the meeting tomorrow at 10:00 AM in Room 302.\n\nI will prepare the progress update and note down any blockers to discuss.\n\nBest regards,\nAnon User",
  "Hello Prof. Smith,\n\nThanks for the reminder. I’ve confirmed the 10:00 AM meeting in Room 302 and will bring a concise progress update, including any current blockers.\n\nKind regards,\nAnon User",
  "Hi Prof. Smith,\n\nConfirmed — I’ll be at Room 302 tomorrow at 10:00 AM with the progress update and blockers ready for discussion.\n\nBest,\nAnon User"
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
  return `<aside class="sidebar">
    <div class="sidebar-top">${logo()}</div>
    <nav class="nav-list" aria-label="Mailbox navigation">
      ${navItems.map(([view, label, navIcon]) => `<button class="nav-item ${state.view === view ? "active" : ""}" data-nav="${view}" aria-label="${label}">${icon(navIcon)}<span>${label}</span>${view === "inbox" ? '<b class="nav-count">3</b>' : ""}</button>`).join("")}
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
    const haystack = `${email.sender} ${email.subject} ${email.preview}`.toLowerCase();
    return matchesCategory && haystack.includes(state.search.toLowerCase());
  });
  return shell(`<header class="page-header">
    <div><span class="eyebrow">Good morning, ${firstName}</span><h1>Inbox</h1><p>AI has highlighted what needs your attention.</p></div>
    <button class="primary-button compose-button" data-compose>${icon("square-pen")} Compose</button>
  </header>
  <section class="inbox-toolbar">
    <label class="search-box">${icon("search")}<input id="search" type="search" placeholder="Search emails…" value="${state.search}" /><kbd>⌘ K</kbd></label>
    <button class="icon-button filter-button" title="Filter inbox">${icon("list-filter")}</button>
  </section>
  <div class="category-tabs" role="tablist">
    ${["All", "Primary", "Social", "Promotions"].map((category) => `<button class="tab ${state.category === category ? "active" : ""}" data-category="${category}">${category}</button>`).join("")}
  </div>
  <section class="mail-panel">
    <div class="mail-panel-heading"><span>${visible.length} conversations</span><button class="text-button" data-summarize-all>${icon("sparkles")} Summarise inbox</button></div>
    <div class="email-list">
      ${state.emailsLoading && !emails.length ? skeletonRows(8) : visible.length ? visible.map(emailRow).join("") : `<div class="empty-state">${icon("search-x")}<h3>No emails found</h3><p>Try a different search or category.</p></div>`}
    </div>
    ${state.nextPageToken ? `<div class="mail-panel-heading"><button class="text-button" data-load-more ${state.emailsLoading ? "disabled" : ""}>${state.emailsLoading ? "Loading…" : "Load more"}</button></div>` : ""}
  </section>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`);
}

function skeletonRows(count = 8) {
  return Array.from({ length: count }, (_, i) => `
    <article class="email-row skeleton-row" aria-hidden="true">
      <span class="skeleton skeleton-avatar"></span>
      <div class="skeleton skeleton-sender" style="width:${90 + (i % 3) * 20}px"></div>
      <div class="email-content">
        <div class="skeleton skeleton-subject" style="width:${140 + (i % 4) * 30}px"></div>
        <div class="skeleton skeleton-preview" style="width:${200 + (i % 5) * 25}px"></div>
      </div>
      <div class="skeleton skeleton-time"></div>
    </article>`).join("");
}

function emailRow(email) {
  return `<article class="email-row ${email.unread ? "unread" : ""}" data-email="${email.id}" tabindex="0">
    <button class="check-button" aria-label="Select email"><span></span></button>
    <button class="star-button ${email.starred ? "starred" : ""}" data-star="${email.id}" aria-label="Star email">${icon("star")}</button>
    <span class="avatar avatar-sm avatar-soft">${email.sender.split(/\s|@/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
    <div class="email-sender">${email.sender}</div>
    <div class="email-content"><strong>${email.subject}</strong><span>${email.preview}</span></div>
    <time>${escapeHtml(email.time || email.date || "")}</time>
    ${email.unread ? '<span class="unread-dot" aria-label="Unread"></span>' : ""}
  </article>`;
}

function readingView() {
  const email = state.selectedEmail;
  const plainBody = escapeHtml(email.body_plain || email.preview || "").replaceAll("\n", "<br />");
  const messageBody = email._loading ? "<p>Loading email…</p>" : email.body_html || `<p>${plainBody}</p>`;
  const summary = state.aiSummary;
  const extraction = state.aiExtraction;
  return shell(`<header class="compact-header">
    <button class="back-button" data-nav="inbox">${icon("arrow-left")}</button>
    <div><span class="eyebrow">Inbox / Primary</span><h1>${email.subject}</h1></div>
    <div class="header-actions"><button class="icon-button" title="Archive">${icon("archive")}</button><button class="icon-button" title="Delete">${icon("trash-2")}</button><button class="icon-button" title="More">${icon("ellipsis")}</button></div>
  </header>
  <div class="reading-grid">
    <article class="message-card">
      <div class="message-from"><span class="avatar">PS</span><div><strong>${escapeHtml(email.sender)}</strong><small>${escapeHtml(email.to || email.address || "")}</small></div><time>${escapeHtml(email.time || email.date || "")}</time><button class="star-button">${icon("star")}</button></div>
      <div class="message-body">${messageBody}</div>
      <div class="message-actions"><button class="secondary-button" data-reply>${icon("reply")} Reply</button><button class="secondary-button">${icon("reply-all")} Reply all</button><button class="secondary-button">${icon("forward")} Forward</button></div>
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

function replyView() {
  const draft = state.aiDraft || replies[state.replyVersion];
  return shell(`<header class="compact-header">
    <button class="back-button" data-view="reading">${icon("arrow-left")}</button>
    <div><span class="eyebrow">AI generated · review before sending</span><h1>Reply draft</h1></div>
    <button class="secondary-button" data-regenerate>${icon("refresh-cw")} Regenerate</button>
  </header>
  <section class="composer-card">
    <div class="field-row"><label>To</label><div class="input-shell"><span class="avatar avatar-xs">PS</span> Prof. Smith &lt;smith@university.edu&gt;</div></div>
    <div class="field-row"><label>Subject</label><div class="input-shell">Re: Project Meeting Tomorrow</div></div>
    <div class="ai-draft-label"><span>${icon("sparkles")} AI generated reply</span><small>Version ${state.replyVersion + 1} of 3 · Edit as needed</small></div>
    ${state.aiDraftLoading ? '<div class="reply-editor">Generating draft…</div>' : `<textarea id="reply-text" class="reply-editor">${escapeHtml(draft)}</textarea>`}
    <div class="tone-row"><span>Quick tone</span>${["professional", "concise", "friendly"].map((tone) => `<button class="tone-chip ${state.aiDraftTone === tone ? "active" : ""}" data-tone="${tone}">${tone[0].toUpperCase() + tone.slice(1)}</button>`).join("")}</div>
    <div class="composer-footer"><div class="compose-tools"><button class="icon-button">${icon("paperclip")}</button><button class="icon-button">${icon("smile")}</button><button class="icon-button">${icon("image")}</button><button class="icon-button" data-voice>${icon("mic")}</button></div><div><button class="secondary-button" data-discard>Discard</button><button class="primary-button" data-send>${icon("send")} Send reply</button></div></div>
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
  return shell(`<header class="compact-header"><button class="back-button" data-nav="inbox">${icon("arrow-left")}</button><div><span class="eyebrow">New message</span><h1>Compose</h1></div><button class="text-button" data-ai-compose>${icon("sparkles")} Write with AI</button></header>
  <section class="composer-card compose-new"><div class="field-row"><label>To</label><input id="compose-to" class="input-shell" placeholder="Recipient" /></div><div class="field-row"><label>Subject</label><input id="compose-subject" class="input-shell" placeholder="Email subject" /></div><textarea id="compose-body" class="reply-editor" placeholder="Write a message, or ask Revo AI for a first draft…"></textarea><div class="composer-footer"><div class="compose-tools"><button class="icon-button">${icon("paperclip")}</button><button class="icon-button">${icon("smile")}</button><button class="icon-button" data-voice>${icon("mic")}</button></div><button class="primary-button" data-send>${icon("send")} Send</button></div></section>`);
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
    else content = placeholderView("Sent", "send");
    app.innerHTML = content + voiceModal() + toast();
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
    state.authenticated = false; state.user = null; state.csrfToken = ""; state.accounts = []; state.view = "inbox"; render();
  }));
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.nav; render(); }));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
  document.querySelectorAll("[data-email]").forEach((row) => row.addEventListener("click", async (event) => {
    if (event.target.closest("button")) return;
    const selected = emails.find((email) => String(email.id) === row.dataset.email);
    if (!selected) return;
    state.aiSummary = null;
    state.aiExtraction = null;
    state.aiDraft = "";
    state.selectedEmail = { ...selected, _loading: !selected.body_plain && !selected.body_html };
    state.selectedEmail.unread = false;
    state.view = "reading";
    render();
    if (!state.selectedEmail._loading) return;
    try {
      state.selectedEmail = await api(`/api/v1/emails/${encodeURIComponent(selected.id)}`);
      render();
    } catch (error) {
      state.selectedEmail._loading = false;
      showToast(error.message);
    }
  }));
  document.querySelectorAll("[data-star]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const email = emails.find((item) => String(item.id) === button.dataset.star); if (email) email.starred = !email.starred; render(); }));
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelector("#search")?.addEventListener("input", (event) => { state.search = event.target.value; render(); document.querySelector("#search")?.focus(); });
  document.querySelector("[data-compose]")?.addEventListener("click", () => { state.view = "compose"; render(); });
  document.querySelector("[data-reply]")?.addEventListener("click", () => { state.view = "reply"; if (!state.aiDraft) void aiDraftReply(state.aiDraftTone); else render(); });
  document.querySelector("[data-regenerate]")?.addEventListener("click", () => void aiDraftReply(state.aiDraftTone));
  document.querySelectorAll("[data-tone]").forEach((button) => button.addEventListener("click", () => void aiDraftReply(button.dataset.tone)));
  document.querySelector("[data-discard]")?.addEventListener("click", () => { state.view = "reading"; render(); });
  document.querySelectorAll("[data-send]").forEach((button) => button.addEventListener("click", () => { state.view = "sent"; showToast("Message sent — human review complete"); }));
  document.querySelector("[data-ai-compose]")?.addEventListener("click", () => { const field = document.querySelector("#compose-body"); field.value = "Hi,\n\nI’m following up with a quick update on our project progress. The team has completed the initial planning and is now preparing the interactive prototype.\n\nBest regards,\nAnon User"; showToast("AI draft inserted — review before sending"); });
  document.querySelector("[data-summarize-all]")?.addEventListener("click", () => showToast("6 emails summarised: 2 need attention today"));
  document.querySelector("[data-load-more]")?.addEventListener("click", () => void fetchEmails(state.nextPageToken));
  document.querySelector("[data-ai-summarise]")?.addEventListener("click", () => void aiSummarise());
  document.querySelector("[data-ai-extract]")?.addEventListener("click", () => void aiExtract());
  document.querySelectorAll("[data-add-event]").forEach((button) => button.addEventListener("click", () => { state.eventAdded = true; showToast("Project Meeting added to calendar"); }));
  document.querySelector("[data-add-assignment]")?.addEventListener("click", () => { state.assignmentAdded = true; showToast("Assignment deadline added to calendar"); });
  document.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", () => { state.theme = button.dataset.theme; render(); }));
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

async function fetchEmails(pageToken = null) {
  state.emailsLoading = true;
  render();
  try {
    const query = new URLSearchParams({ max_results: "20" });
    if (pageToken) query.set("page_token", pageToken);
    const payload = await api(`/api/v1/emails?${query}`);
    emails = pageToken ? [...emails, ...payload.messages] : payload.messages;
    state.nextPageToken = payload.next_page_token || null;
    if (!pageToken && emails.length) state.selectedEmail = emails[0];
  } catch (error) {
    showToast(error.message);
  } finally {
    state.emailsLoading = false;
    render();
  }
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

async function aiDraftReply(tone) {
  if (!state.selectedEmail) return;
  state.aiDraftTone = tone;
  state.aiDraftLoading = true;
  render();
  try {
    const payload = await api("/api/v1/ai/draft-reply", { method: "POST", body: JSON.stringify({ message_id: String(state.selectedEmail.id), tone }) });
    state.aiDraft = payload.draft;
  } catch (error) {
    showToast(error.message);
  } finally {
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
    }
  } catch (error) {
    state.authenticated = false;
    state.authError ||= "RevoMail could not check provider availability.";
  }
  render();
}

render();
bootstrap();
