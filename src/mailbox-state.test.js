import { describe, expect, it } from "vitest";

import { applyClassifications, applyMailboxPage, formatLocalDateTime, LatestRequestCoordinator, mailboxContentState, matchesMailboxCategory, selectAfterMailboxRefresh } from "./mailbox-state.js";


describe("mailbox state", () => {
  it("cancels stale requests and accepts completion only from the latest request", () => {
    const requests = new LatestRequestCoordinator();
    const first = requests.begin("mailbox");
    const second = requests.begin("mailbox");

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(requests.finish("mailbox", first)).toBe(false);
    expect(requests.finish("mailbox", second)).toBe(true);
  });

  it("cancels an active request when its view is left", () => {
    const requests = new LatestRequestCoordinator();
    const active = requests.begin("message-detail");

    requests.cancel("message-detail");

    expect(active.signal.aborted).toBe(true);
    expect(requests.finish("message-detail", active)).toBe(false);
  });

  it("treats Primary as the main inbox without Social or Promotions", () => {
    expect(matchesMailboxCategory({ category: "Primary" }, "Primary")).toBe(true);
    expect(matchesMailboxCategory({ category: "Updates" }, "Primary")).toBe(true);
    expect(matchesMailboxCategory({ category: "Forums" }, "Primary")).toBe(true);
    expect(matchesMailboxCategory({ category: "Social" }, "Primary")).toBe(false);
    expect(matchesMailboxCategory({ category: "Promotions" }, "Primary")).toBe(false);
  });

  it("shows synchronisation rather than an empty inbox while the first messages are pending", () => {
    expect(mailboxContentState({
      error: "",
      loading: false,
      messageCount: 0,
      visibleCount: 0,
      syncStatus: "syncing"
    })).toBe("syncing");
  });

  it("shows an empty inbox only after loading and synchronisation have finished", () => {
    expect(mailboxContentState({
      error: "",
      loading: false,
      messageCount: 0,
      visibleCount: 0,
      syncStatus: "idle"
    })).toBe("empty");
  });

  it("formats provider timestamps in the selected local timezone", () => {
    expect(formatLocalDateTime("2026-09-28T02:29:00+00:00", "en-AU", "Australia/Sydney"))
      .toBe("28/9/26, 12:29 pm");
  });

  it("leaves an invalid provider date visible instead of throwing", () => {
    expect(formatLocalDateTime("unknown date", "en-AU", "Australia/Sydney")).toBe("unknown date");
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
describe("priority classification", () => {
  const inbox = [{ id: "a", subject: "Deadline" }, { id: "b", subject: "Sale" }, { id: "c", subject: "Hello" }];

  it("attaches priority and reason to matching messages without mutating the originals", () => {
    const result = applyClassifications(inbox, {
      a: { priority: "high", reason: "Deadline tomorrow" },
      b: { priority: "low", reason: "Promotional" }
    });

    expect(result[0]).toMatchObject({ id: "a", priority: "high", priorityReason: "Deadline tomorrow" });
    expect(result[1]).toMatchObject({ id: "b", priority: "low" });
    expect(result[2]).toEqual({ id: "c", subject: "Hello" });
    expect(inbox[0].priority).toBeUndefined();
  });

  it("ignores unknown priorities and missing or malformed payloads", () => {
    expect(applyClassifications(inbox, { a: { priority: "urgent!!" } })[0].priority).toBeUndefined();
    expect(applyClassifications(inbox, null)).toEqual(inbox);
    expect(applyClassifications(inbox, undefined)).toEqual(inbox);
  });

  it("matches numeric provider ids against string keys", () => {
    const result = applyClassifications([{ id: 7 }], { 7: { priority: "medium", reason: "" } });
    expect(result[0].priority).toBe("medium");
  });
});
