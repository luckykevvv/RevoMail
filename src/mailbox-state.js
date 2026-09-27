export function applyMailboxPage(currentMessages, payload, { append = false } = {}) {
  const providerMessages = Array.isArray(payload?.messages) ? payload.messages : [];
  return {
    messages: append ? [...currentMessages, ...providerMessages] : providerMessages,
    selectedMessage: append ? currentMessages[0] || null : providerMessages[0] || null,
    nextPageToken: payload?.next_page_token || null
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
