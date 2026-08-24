export function matchesMailboxCategory(message, category) {
  if (category === "All") return true;
  if (category === "Primary") return !["Social", "Promotions"].includes(message?.category);
  return message?.category === category;
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

export function selectAfterMailboxRefresh(currentSelection, messages, { background = false } = {}) {
  if (!background || !currentSelection?.id) return messages[0] || null;
  const refreshed = messages.find((message) => String(message.id) === String(currentSelection.id));
  return refreshed ? { ...currentSelection, ...refreshed } : currentSelection;
}
