import { describe, expect, it } from "vitest";

import { applyMailboxPage, matchesMailboxCategory, selectAfterMailboxRefresh } from "./mailbox-state.js";


describe("mailbox state", () => {
  it("treats Primary as the main inbox without Social or Promotions", () => {
    expect(matchesMailboxCategory({ category: "Primary" }, "Primary")).toBe(true);
    expect(matchesMailboxCategory({ category: "Updates" }, "Primary")).toBe(true);
    expect(matchesMailboxCategory({ category: "Forums" }, "Primary")).toBe(true);
    expect(matchesMailboxCategory({ category: "Social" }, "Primary")).toBe(false);
    expect(matchesMailboxCategory({ category: "Promotions" }, "Primary")).toBe(false);
  });

  it("replaces stale or preset messages with the first provider page", () => {
    const result = applyMailboxPage(
      [{ id: "preset", subject: "Preset message" }],
      { messages: [{ id: "user-message", subject: "User message" }], next_page_token: "next" }
    );

    expect(result.messages).toEqual([{ id: "user-message", subject: "User message" }]);
    expect(result.selectedMessage.id).toBe("user-message");
    expect(result.nextPageToken).toBe("next");
  });

  it("returns an empty mailbox when the provider has no messages", () => {
    const result = applyMailboxPage(
      [{ id: "preset", subject: "Preset message" }],
      { messages: [], next_page_token: null }
    );

    expect(result).toEqual({ messages: [], selectedMessage: null, nextPageToken: null, sync: null });
  });

  it("appends later provider pages without changing the first selection", () => {
    const result = applyMailboxPage(
      [{ id: "first", subject: "First page" }],
      { messages: [{ id: "second", subject: "Second page" }], next_page_token: null },
      { append: true }
    );

    expect(result.messages.map((message) => message.id)).toEqual(["first", "second"]);
    expect(result.selectedMessage.id).toBe("first");
  });

  it("removes duplicate message ids from legacy pages", () => {
    const result = applyMailboxPage(
      [{ id: "first", subject: "Old" }],
      { messages: [{ id: "first", subject: "Fresh" }, { id: "second" }], next_page_token: "cursor", sync: { status: "idle" } },
      { append: true }
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].subject).toBe("Fresh");
    expect(result.nextPageToken).toBe("cursor");
    expect(result.sync.status).toBe("idle");
  });

  it("preserves the reading selection and loaded body during a background refresh", () => {
    const selected = { id: "first", subject: "Old", bodyText: "Loaded body" };
    const refreshed = selectAfterMailboxRefresh(selected, [{ id: "first", subject: "Fresh" }], { background: true });

    expect(refreshed).toEqual({ id: "first", subject: "Fresh", bodyText: "Loaded body" });
  });
});
