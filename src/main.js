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

// Emails are loaded from the API after login. Starts empty.
let emails = [];
let nextPageToken = null;

const API = "http://localhost:8000/api";

const state = {
  authenticated: false,
  user: null,        // { email, name, picture } from /api/auth/me
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
  emailsLoading: false,
  toast: ""
};

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
        <div class="oauth-stack">
          <a class="oauth google" href="${API}/auth/google"><span class="provider provider-google">G</span>Continue with Google</a>
          <button class="oauth microsoft" disabled title="Coming soon"><span class="provider provider-microsoft">⊞</span>Continue with Microsoft</button>
          <button class="oauth apple" disabled title="Coming soon"><span class="provider">●</span>Continue with Apple</button>
          <button class="oauth facebook" disabled title="Coming soon"><span class="provider provider-facebook">f</span>Continue with Facebook</button>
        </div>
        <p class="secure-note">${icon("shield-check")} OAuth 2.0 · RevoMail never sees your password</p>
        <p class="legal">By continuing, you agree to the Terms and Privacy Policy.</p>
      </div>
    </section>
  </main>`;
}

function sidebar() {
  return `<aside class="sidebar">
    <div class="sidebar-top">${logo()}</div>
    <nav class="nav-list" aria-label="Mailbox navigation">
      ${navItems.map(([view, label, navIcon]) => { const unread = emails.filter(e => e.unread).length; return `<button class="nav-item ${state.view === view ? "active" : ""}" data-nav="${view}">${icon(navIcon)}<span>${label}</span>${view === "inbox" && unread > 0 ? `<b class="nav-count">${unread}</b>` : ""}</button>`; }).join("")}
    </nav>
    <div class="account-card">
      <span class="avatar">${state.user ? state.user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) : "?"}</span>
      <span class="account-copy"><strong>${state.user?.name || "..."}</strong><small>${state.user?.email || ""}</small></span>
      <button class="icon-button" data-logout title="Sign out">${icon("log-out")}</button>
    </div>
  </aside>`;
}

function shell(content) {
  return `<main class="app-shell">${sidebar()}<section class="workspace">${content}</section></main>`;
}

function inboxView() {
  const visible = emails.filter((email) => {
    const matchesCategory = state.category === "All" || email.category === state.category;
    const haystack = `${email.sender} ${email.subject} ${email.preview}`.toLowerCase();
    return matchesCategory && haystack.includes(state.search.toLowerCase());
  });
  const firstName = state.user?.name?.split(" ")[0] || "there";
  const unreadCount = emails.filter(e => e.unread).length;
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
      ${state.emailsLoading
        ? `<div class="empty-state">${icon("refresh-cw")} <h3>Loading emails…</h3></div>`
        : visible.length
          ? visible.map(emailRow).join("") + (nextPageToken ? `<button class="text-button load-more" data-load-more>Load more</button>` : "")
          : `<div class="empty-state">${icon("search-x")}<h3>No emails found</h3><p>Try a different search or category.</p></div>`
      }
    </div>
  </section>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`);
}

function emailRow(email) {
  // sender field from Gmail API is "Name <email@example.com>" — extract just the name part
  const senderName = email.sender.replace(/<.*>/, "").trim() || email.sender;
  const initials = senderName.split(/\s|@/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
  const displayDate = email.date ? new Date(email.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
  return `<article class="email-row ${email.unread ? "unread" : ""}" data-email="${email.id}" tabindex="0">
    <button class="check-button" aria-label="Select email"><span></span></button>
    <button class="star-button ${email.starred ? "starred" : ""}" data-star="${email.id}" aria-label="Star email">${icon("star")}</button>
    <span class="avatar avatar-sm avatar-soft">${initials}</span>
    <div class="email-sender">${senderName}</div>
    <div class="email-content"><strong>${email.subject}</strong><span>${email.preview}</span></div>
    <time>${displayDate}</time>
    ${email.unread ? '<span class="unread-dot" aria-label="Unread"></span>' : ""}
  </article>`;
}

function readingView() {
  const email = state.selectedEmail;
  return shell(`<header class="compact-header">
    <button class="back-button" data-nav="inbox">${icon("arrow-left")}</button>
    <div><span class="eyebrow">Inbox / Primary</span><h1>${email.subject}</h1></div>
    <div class="header-actions"><button class="icon-button" title="Archive">${icon("archive")}</button><button class="icon-button" title="Delete">${icon("trash-2")}</button><button class="icon-button" title="More">${icon("ellipsis")}</button></div>
  </header>
  <div class="reading-grid">
    <article class="message-card">
      <div class="message-from"><span class="avatar">${(email.sender||"?").split(/\s|@/).slice(0,2).map(p=>p[0]).join("").toUpperCase()||"?"}</span><div><strong>${email.sender}</strong><small>${email.date || ""}</small></div><button class="star-button">${icon("star")}</button></div>
      <div class="message-body">${email.body_html ? email.body_html : (email.body_plain || email.preview || "").split("\n").map(l=>`<p>${l}</p>`).join("")}</div>
      <div class="message-actions"><button class="secondary-button" data-reply>${icon("reply")} Reply</button><button class="secondary-button">${icon("reply-all")} Reply all</button><button class="secondary-button">${icon("forward")} Forward</button></div>
    </article>
    <aside class="ai-rail">
      <section class="insight-card summary-card"><div class="insight-title"><span>${icon("sparkles")}</span><div><small>REVO AI</small><h2>Summary</h2></div><span class="confidence">High confidence</span></div><ul><li>Project meeting tomorrow at 10:00 AM</li><li>Location: Room 302</li><li>Prepare a progress update and blockers</li></ul></section>
      <section class="insight-card"><div class="insight-title"><span>${icon("scan-text")}</span><div><small>EXTRACTED</small><h2>Key details</h2></div></div><dl class="detail-list"><div><dt>${icon("clock-3")} Time</dt><dd>Tomorrow, 10:00 AM</dd></div><div><dt>${icon("map-pin")} Location</dt><dd>Room 302</dd></div><div><dt>${icon("file-check-2")} Prepare</dt><dd>Progress update & blockers</dd></div></dl><button class="inline-action" data-add-event>${icon("calendar-plus")} Add to calendar</button></section>
    </aside>
  </div>
  <button class="floating-mic" data-voice title="Voice input">${icon("mic")}</button>`);
}

function replyView() {
  return shell(`<header class="compact-header">
    <button class="back-button" data-view="reading">${icon("arrow-left")}</button>
    <div><span class="eyebrow">AI generated · review before sending</span><h1>Reply draft</h1></div>
    <button class="secondary-button" data-regenerate>${icon("refresh-cw")} Regenerate</button>
  </header>
  <section class="composer-card">
    <div class="field-row"><label>To</label><div class="input-shell"><span class="avatar avatar-xs">PS</span> Prof. Smith &lt;smith@university.edu&gt;</div></div>
    <div class="field-row"><label>Subject</label><div class="input-shell">Re: Project Meeting Tomorrow</div></div>
    <div class="ai-draft-label"><span>${icon("sparkles")} AI generated reply</span><small>Version ${state.replyVersion + 1} of 3 · Edit as needed</small></div>
    <textarea id="reply-text" class="reply-editor">${replies[state.replyVersion]}</textarea>
    <div class="tone-row"><span>Quick tone</span><button class="tone-chip active">Professional</button><button class="tone-chip" data-tone="concise">Concise</button><button class="tone-chip" data-tone="friendly">Friendly</button></div>
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
  if (!state.authenticated) {
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
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" });
    state.authenticated = false;
    state.user = null;
    state.view = "inbox";
    render();
  });
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.nav; render(); }));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => { state.view = button.dataset.view; render(); }));
  document.querySelectorAll("[data-email]").forEach((row) => row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    state.selectedEmail = emails.find((email) => email.id === row.dataset.email);
    if (state.selectedEmail) {
      state.selectedEmail.unread = false;
      state.view = "reading";
      render();
    }
  }));
  document.querySelector("[data-load-more]")?.addEventListener("click", () => fetchEmails(nextPageToken));
  document.querySelectorAll("[data-star]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const email = emails.find((item) => item.id === Number(button.dataset.star)); email.starred = !email.starred; render(); }));
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelector("#search")?.addEventListener("input", (event) => { state.search = event.target.value; render(); document.querySelector("#search")?.focus(); });
  document.querySelector("[data-compose]")?.addEventListener("click", () => { state.view = "compose"; render(); });
  document.querySelector("[data-reply]")?.addEventListener("click", () => { state.view = "reply"; render(); });
  document.querySelector("[data-regenerate]")?.addEventListener("click", () => { state.replyVersion = (state.replyVersion + 1) % replies.length; render(); });
  document.querySelectorAll("[data-tone]").forEach((button) => button.addEventListener("click", () => { state.replyVersion = button.dataset.tone === "concise" ? 2 : 1; render(); }));
  document.querySelector("[data-discard]")?.addEventListener("click", () => { state.view = "reading"; render(); });
  document.querySelectorAll("[data-send]").forEach((button) => button.addEventListener("click", () => { state.view = "sent"; showToast("Message sent — human review complete"); }));
  document.querySelector("[data-ai-compose]")?.addEventListener("click", () => { const field = document.querySelector("#compose-body"); field.value = "Hi,\n\nI’m following up with a quick update on our project progress. The team has completed the initial planning and is now preparing the interactive prototype.\n\nBest regards,\nAnon User"; showToast("AI draft inserted — review before sending"); });
  document.querySelector("[data-summarize-all]")?.addEventListener("click", () => showToast("6 emails summarised: 2 need attention today"));
  document.querySelectorAll("[data-add-event]").forEach((button) => button.addEventListener("click", () => { state.eventAdded = true; showToast("Project Meeting added to calendar"); }));
  document.querySelector("[data-add-assignment]")?.addEventListener("click", () => { state.assignmentAdded = true; showToast("Assignment deadline added to calendar"); });
  document.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", () => { state.theme = button.dataset.theme; render(); }));
  document.querySelectorAll(".toggle").forEach((button) => button.addEventListener("click", () => { button.classList.toggle("active"); button.setAttribute("aria-checked", button.classList.contains("active")); }));
  document.querySelectorAll("[data-voice]").forEach((button) => button.addEventListener("click", openVoice));
  document.querySelector("[data-close-voice]")?.addEventListener("click", () => { state.voiceOpen = false; clearTimeout(voiceTimer); render(); });
  document.querySelector(".modal-backdrop")?.addEventListener("click", (event) => { if (event.target.classList.contains("modal-backdrop")) { state.voiceOpen = false; clearTimeout(voiceTimer); render(); } });
  document.querySelector("[data-toggle-listening]")?.addEventListener("click", () => { state.voiceListening = !state.voiceListening; render(); });
  document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => { state.transcript = button.dataset.command; state.voiceListening = false; render(); }));
  document.querySelector("[data-run-command]")?.addEventListener("click", () => { state.voiceOpen = false; state.view = state.transcript.toLowerCase().includes("task") ? "tasks" : "reading"; showToast("Voice command completed"); });
}

// ---------------------------------------------------------------------------
// Fetch emails from the API and update state.
// ---------------------------------------------------------------------------
async function fetchEmails(pageToken = null) {
  state.emailsLoading = true;
  render();
  try {
    const url = `${API}/emails?max_results=20${pageToken ? `&page_token=${pageToken}` : ""}`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    emails = pageToken ? [...emails, ...data.messages] : data.messages;
    nextPageToken = data.next_page_token || null;
  } catch (err) {
    showToast("Could not load emails — " + err.message);
  } finally {
    state.emailsLoading = false;
    render();
  }
}

// ---------------------------------------------------------------------------
// Startup — check if the user already has a valid session, or if they just
// returned from the Google OAuth callback (?auth=success).
// ---------------------------------------------------------------------------
async function init() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("auth_error")) {
    showToast("Sign-in failed: " + params.get("auth_error"));
    window.history.replaceState({}, "", "/");
  }

  try {
    const res = await fetch(`${API}/auth/me`, { credentials: "include" });
    if (res.ok) {
      state.user = await res.json();
      state.authenticated = true;
      if (params.get("auth") === "success") {
        window.history.replaceState({}, "", "/");
        showToast(`Welcome back, ${state.user.name.split(" ")[0]}!`);
      }
      // Load real emails immediately after session is confirmed
      await fetchEmails();
      return; // render() already called inside fetchEmails
    }
  } catch {
    // Backend not running or network error — stay on login screen
  }

  render();
}

init();
