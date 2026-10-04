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

export function setMessageUnread(messages, id, unread) {
  return messages.map((message) => (String(message.id) === String(id) ? { ...message, unread: Boolean(unread) } : message));
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
