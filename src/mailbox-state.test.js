import { describe, expect, it } from "vitest";

import { applyClassifications, applyMailboxPage, calendarPayload, eventDraftFromExtraction, outgoingProblem, replySubject, setMessageUnread } from "./mailbox-state.js";


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

describe("read state", () => {
  const inbox = [{ id: "a", unread: true }, { id: "b", unread: true }];

  it("updates only the matching message without mutating the original", () => {
    const result = setMessageUnread(inbox, "a", false);
    expect(result).toEqual([{ id: "a", unread: false }, { id: "b", unread: true }]);
    expect(inbox[0].unread).toBe(true);
  });

  it("can restore unread state and matches numeric ids against strings", () => {
    const read = setMessageUnread(inbox, "b", false);
    expect(setMessageUnread(read, "b", true)[1].unread).toBe(true);
    expect(setMessageUnread([{ id: 7, unread: true }], "7", false)[0].unread).toBe(false);
  });
});

describe("outgoing mail helpers", () => {
  it("prefixes reply subjects once", () => {
    expect(replySubject("Project Meeting Tomorrow")).toBe("Re: Project Meeting Tomorrow");
    expect(replySubject("RE: Project Meeting Tomorrow")).toBe("RE: Project Meeting Tomorrow");
    expect(replySubject("  ")).toBe("Re:");
  });

  it("blocks empty messages and replies without an address", () => {
    expect(outgoingProblem({ isReply: true, replyTo: ["a@example.com"], body: "  " })).toMatch(/Write a message/);
    expect(outgoingProblem({ isReply: true, replyTo: [], body: "Hi" })).toMatch(/no address/);
    expect(outgoingProblem({ isReply: true, body: "Hi" })).toMatch(/no address/);
    expect(outgoingProblem({ isReply: false, to: " ", body: "Hi" })).toMatch(/recipient/);
  });

  it("accepts a ready reply or new message", () => {
    expect(outgoingProblem({ isReply: true, replyTo: ["a@example.com"], body: "Hi" })).toBe("");
    expect(outgoingProblem({ isReply: false, to: "b@example.com", body: "Hi" })).toBe("");
  });
});

describe("calendar helpers", () => {
  it("pre-fills a timed event from the extraction", () => {
    const draft = eventDraftFromExtraction({ title: "Project Meeting", start: "2026-10-05T10:00", end: "2026-10-05T11:30", location: "Room 302" }, "Meeting tomorrow");
    expect(draft).toMatchObject({ title: "Project Meeting", date: "2026-10-05", startTime: "10:00", endTime: "11:30", allDay: false, location: "Room 302" });
    expect(draft.description).toContain("Meeting tomorrow");
  });

  it("treats a date without a time as all day and leaves unknowns empty", () => {
    expect(eventDraftFromExtraction({ title: "Holiday", start: "2026-12-25" })).toMatchObject({ date: "2026-12-25", startTime: "", allDay: true });
    expect(eventDraftFromExtraction({ title: "Vague", start: null })).toMatchObject({ date: "", startTime: "", endTime: "", allDay: false });
    expect(eventDraftFromExtraction({ title: "Overnight", start: "2026-10-05T22:00", end: "2026-10-06T02:00" }).endTime).toBe("");
  });

  it("builds a payload for a valid timed event", () => {
    const { payload } = calendarPayload({ title: " Meeting ", date: "2026-10-05", startTime: "10:00", endTime: "", allDay: false, location: " Room 1 ", description: "d" }, "Australia/Melbourne");
    expect(payload).toEqual({ title: "Meeting", startsAt: "2026-10-05T10:00", endsAt: null, allDay: false, timezone: "Australia/Melbourne", location: "Room 1", description: "d" });
  });

  it("builds an all-day payload without times", () => {
    const { payload } = calendarPayload({ title: "Holiday", date: "2026-12-25", startTime: "09:00", endTime: "10:00", allDay: true }, "UTC");
    expect(payload).toMatchObject({ startsAt: "2026-12-25", endsAt: null, allDay: true });
  });

  it("explains what is missing or wrong", () => {
    const ok = { title: "T", date: "2026-10-05", startTime: "10:00", endTime: "11:00", allDay: false };
    expect(calendarPayload({ ...ok, title: " " }, "UTC").error).toMatch(/title/);
    expect(calendarPayload({ ...ok, date: "" }, "UTC").error).toMatch(/date/);
    expect(calendarPayload({ ...ok, startTime: "" }, "UTC").error).toMatch(/start time/);
    expect(calendarPayload({ ...ok, endTime: "09:00" }, "UTC").error).toMatch(/after the start/);
    expect(calendarPayload({ ...ok, endTime: "10:00" }, "UTC").error).toMatch(/after the start/);
  });
});
