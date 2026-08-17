import { describe, expect, it } from "vitest";

import { applyMailboxPage } from "./mailbox-state.js";


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
