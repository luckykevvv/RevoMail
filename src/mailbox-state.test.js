import { describe, expect, it } from "vitest";

import { applyClassifications, applyMailboxPage } from "./mailbox-state.js";


describe("mailbox state", () => {
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

    expect(result).toEqual({ messages: [], selectedMessage: null, nextPageToken: null });
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
