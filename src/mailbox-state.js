export class LatestRequestCoordinator {
  constructor() {
    this.controllers = new Map();
  }

  begin(key) {
    this.controllers.get(key)?.abort();
    const controller = new AbortController();
    this.controllers.set(key, controller);
    return controller;
  }

  finish(key, controller) {
    if (this.controllers.get(key) !== controller) return false;
    this.controllers.delete(key);
    return true;
  }

  cancel(key) {
    this.controllers.get(key)?.abort();
    this.controllers.delete(key);
  }
}

export function matchesMailboxCategory(message, category) {
  if (category === "All") return true;
  if (category === "Primary") return !["Social", "Promotions"].includes(message?.category);
  return message?.category === category;
}

export function mailboxContentState({ error, loading, messageCount, visibleCount, syncStatus }) {
  if (error) return "error";
  if (loading && messageCount === 0) return "loading";
  if (visibleCount > 0) return "messages";
  if (messageCount > 0) return "filtered-empty";
  if (syncStatus === "syncing") return "syncing";
  return "empty";
}

export function formatLocalDateTime(value, locale, timeZone) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {})
  }).format(date);
}

export function formatRefreshAge(value, { now = new Date(), locale = "en" } = {}) {
  const refreshedAt = parseMailDate(value);
  const current = now instanceof Date ? now : new Date(now);
  if (!refreshedAt || Number.isNaN(current.getTime())) return "";
  const elapsedSeconds = Math.max(0, Math.floor((current.getTime() - refreshedAt.getTime()) / 1000));
  if (elapsedSeconds < 60) return String(locale).toLowerCase().startsWith("zh") ? "刚刚" : "just now";
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (elapsedSeconds < 3600) return formatter.format(-Math.floor(elapsedSeconds / 60), "minute");
  if (elapsedSeconds < 86400) return formatter.format(-Math.floor(elapsedSeconds / 3600), "hour");
  return formatter.format(-Math.floor(elapsedSeconds / 86400), "day");
}

export function applyMailboxPage(currentMessages, payload, { append = false } = {}) {
  const providerMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  const combined = append ? [...currentMessages, ...providerMessages] : providerMessages;
  const messages = [...new Map(combined.map((message) => [String(message.id), message])).values()];
  return {
    messages,
    selectedMessage: append ? currentMessages[0] || null : providerMessages[0] || null,
    nextPageToken: payload?.next_page_token || null,
    sync: payload?.sync || null
  };
}

export const PRIORITY_LEVELS = ["high", "medium", "low"];

export function applyClassifications(messages, classifications) {
  const labels = classifications && typeof classifications === "object" ? classifications : {};
  return messages.map((message) => {
    const label = labels[String(message.id)];
    if (!label || !PRIORITY_LEVELS.includes(label.priority)) return message;
    return { ...message, priority: label.priority, priorityReason: String(label.reason || "") };
  });
}

export function selectAfterMailboxRefresh(currentSelection, messages, { background = false } = {}) {
  if (!background || !currentSelection?.id) return messages[0] || null;
  const refreshed = messages.find((message) => String(message.id) === String(currentSelection.id));
  return refreshed ? { ...currentSelection, ...refreshed } : currentSelection;
}

export function replySubject(subject) {
  const text = String(subject || "").trim();
  if (/^re:/i.test(text)) return text;
  return text ? `Re: ${text}` : "Re:";
}

// Returns a user-facing problem with an outgoing message, or "" when it is ready to be reviewed.
// Address syntax is validated by the server; replies are addressed server-side from the original message.
export function outgoingProblem({ isReply, to, replyTo, body }) {
  if (!String(body || "").trim()) return "Write a message before sending.";
  if (isReply) return Array.isArray(replyTo) && replyTo.length ? "" : "This message has no address to reply to.";
  return String(to || "").trim() ? "" : "Enter a recipient before sending.";
}

// Pre-fills the "add to calendar" form from an extracted event. Anything the AI could not work out stays
// empty so the user fills it in; nothing is guessed here.
export function eventDraftFromExtraction(event, subject = "") {
  const start = typeof event?.start === "string" ? event.start : "";
  const end = typeof event?.end === "string" ? event.end : "";
  const [date = "", startTime = ""] = start.split("T");
  const [endDate = "", endTime = ""] = end.split("T");
  return {
    title: String(event?.title || ""),
    date,
    startTime,
    endTime: endDate === date ? endTime : "",
    allDay: Boolean(date && !startTime),
    location: String(event?.location || ""),
    description: subject ? `Added from the email "${subject}" in RevoMail.` : ""
  };
}

// Validates the (user-edited) form and builds the API payload, or returns { error } for the user.
export function calendarPayload(draft, timeZone) {
  const title = String(draft?.title || "").trim();
  if (!title) return { error: "Enter a title for the event." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date || "")) return { error: "Choose the event date." };
  const timePattern = /^\d{2}:\d{2}$/;
  if (!draft.allDay) {
    if (!timePattern.test(draft.startTime || "")) return { error: "Choose a start time, or mark the event as all day." };
    if (draft.endTime && !timePattern.test(draft.endTime)) return { error: "Choose a valid end time." };
    if (draft.endTime && draft.endTime <= draft.startTime) return { error: "The end time must be after the start time." };
  }
  return {
    payload: {
      title,
      startsAt: draft.allDay ? draft.date : `${draft.date}T${draft.startTime}`,
      endsAt: !draft.allDay && draft.endTime ? `${draft.date}T${draft.endTime}` : null,
      allDay: Boolean(draft.allDay),
      timezone: timeZone,
      location: String(draft.location || "").trim(),
      description: String(draft.description || "")
    }
  };
}

// Turns a message timestamp into a Date. Accepts Gmail's internal date (epoch milliseconds, as a number or digit
// string) or an RFC 2822 Date header. Returns null when the value is missing or unreadable.
export function parseMailDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = typeof value === "number" || /^\d{10,}$/.test(String(value)) ? new Date(Number(value)) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Short label for a message list, in the viewer's local time zone, like Gmail: the time for today, "28 Sep" for
// earlier this year, "28 Sep 2025" for older mail. Returns "" when the value cannot be read.
export function formatMailTime(value, { now = new Date(), timeZone, locale } = {}) {
  const date = parseMailDate(value);
  if (!date) return "";
  if (dayKey(date, timeZone) === dayKey(now, timeZone)) {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone }).format(date);
  }
  const sameYear = dayKey(date, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone }).format(date);
}

// Full date and time for the message view and tooltips, in the viewer's local time zone.
export function formatFullMailTime(value, { timeZone, locale } = {}) {
  const date = parseMailDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(date);
}

export function setMessageUnread(messages, id, unread) {
  return messages.map((message) => (String(message.id) === String(id) ? { ...message, unread: Boolean(unread) } : message));
}
