import { describe, expect, it } from "vitest";
import { mergeRefreshedPage } from "./mailbox-state.js";

const page1 = [
  { id: "new", subject: "Brand new", receivedAt: "2026-10-10T02:00:00Z" },
  { id: "a", subject: "A", receivedAt: "2026-10-10T01:00:00Z" },
];

describe("mergeRefreshedPage", () => {
  it("keeps priority labels already assigned so refreshes do not re-classify them", () => {
    const current = [{ id: "a", subject: "A", receivedAt: "2026-10-10T01:00:00Z", priority: "high", priorityReason: "Deadline" }];
    const result = mergeRefreshedPage(current, { messages: page1, next_page_token: null });
    expect(result.messages.map((message) => [message.id, message.priority])).toEqual([["new", undefined], ["a", "high"]]);
    expect(result.messages[1].priorityReason).toBe("Deadline");
  });

  it("keeps emails loaded with Load more and their page token", () => {
    const current = [
      { id: "a", receivedAt: "2026-10-10T01:00:00Z", priority: "low" },
      { id: "older", receivedAt: "2026-10-01T01:00:00Z", priority: "medium" },
    ];
    const result = mergeRefreshedPage(current, { messages: page1, next_page_token: "fresh-token", sync: { status: "idle" } }, "page-3-token");
    expect(result.messages.map((message) => message.id)).toEqual(["new", "a", "older"]);
    expect(result.messages[2].priority).toBe("medium");
    expect(result.nextPageToken).toBe("page-3-token");
    expect(result.sync).toEqual({ status: "idle" });
  });

  it("drops emails that disappeared from the refreshed first page", () => {
    const current = [{ id: "archived", receivedAt: "2026-10-10T01:30:00Z" }, { id: "a", receivedAt: "2026-10-10T01:00:00Z" }];
    const result = mergeRefreshedPage(current, { messages: page1, next_page_token: "fresh-token" }, "old-token");
    expect(result.messages.map((message) => message.id)).toEqual(["new", "a"]);
    expect(result.nextPageToken).toBe("fresh-token");
  });

  it("uses only the fresh page when the inbox fits on one page", () => {
    const current = [{ id: "older", receivedAt: "2026-10-01T01:00:00Z" }];
    const result = mergeRefreshedPage(current, { messages: page1, next_page_token: null }, "old-token");
    expect(result.messages.map((message) => message.id)).toEqual(["new", "a"]);
    expect(result.nextPageToken).toBeNull();
  });
});
