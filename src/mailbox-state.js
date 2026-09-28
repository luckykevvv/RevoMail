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
