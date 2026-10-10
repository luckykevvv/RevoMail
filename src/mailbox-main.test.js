import { describe, expect, it } from "vitest";

import { applyClassifications, applyMailboxPage, calendarPayload, eventDraftFromExtraction, formatFullMailTime, formatMailTime, formatRefreshAge, outgoingProblem, parseMailDate, replySubject, setMessageUnread } from "./mailbox-state.js";


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

describe("mail dates", () => {
  const melbourne = { timeZone: "Australia/Melbourne", locale: "en-AU" };
  const flat = (text) => text.replace(/\s/g, " ").toLowerCase();
  // 2026-10-04 05:00 UTC is 4:00 pm in Melbourne (daylight saving began that morning).
  const now = new Date("2026-10-04T06:00:00Z");

  it("accepts Gmail's internal date (number or digit string) and Date headers", () => {
    expect(parseMailDate(1790528400000).toISOString()).toBe("2026-09-27T17:00:00.000Z");
    expect(parseMailDate("1790528400000").toISOString()).toBe("2026-09-27T17:00:00.000Z");
    expect(parseMailDate("Mon, 28 Sep 2026 00:11:12 +1000").toISOString()).toBe("2026-09-27T14:11:12.000Z");
    expect(parseMailDate("")).toBe(null);
    expect(parseMailDate(undefined)).toBe(null);
    expect(parseMailDate("not a date")).toBe(null);
  });

  it("shows the local time for messages from today", () => {
    expect(flat(formatMailTime(Date.parse("2026-10-04T05:00:00Z"), { ...melbourne, now }))).toBe("4:00 pm");
  });

  it("shows day and month for earlier this year, and the year for older mail", () => {
    const earlier = flat(formatMailTime("Mon, 28 Sep 2026 00:11:12 +1000", { ...melbourne, now }));
    expect(earlier).toContain("28");
    expect(earlier).not.toContain("2026");
    expect(flat(formatMailTime("Tue, 12 Aug 2025 09:00:00 +0000", { ...melbourne, now }))).toContain("2025");
  });

  it("converts to the viewer's own time zone, including the calendar day", () => {
    const stamp = "Mon, 28 Sep 2026 00:11:12 +1000";
    expect(flat(formatFullMailTime(stamp, melbourne))).toContain("28");
    expect(flat(formatFullMailTime(stamp, melbourne))).toContain("12:11 am");
    const newYork = flat(formatFullMailTime(stamp, { timeZone: "America/New_York", locale: "en-US" }));
    expect(newYork).toContain("27");
    expect(newYork).toContain("10:11 am");
  });

  it("decides what counts as today in the viewer's time zone", () => {
    const stamp = Date.parse("2026-10-04T13:30:00Z");
    const later = new Date("2026-10-05T01:00:00Z");
    // In UTC the message is from yesterday; in Kiritimati (UTC+14) it arrived this morning.
    const utc = flat(formatMailTime(stamp, { timeZone: "UTC", locale: "en-GB", now: later }));
    expect(utc).toContain("4");
    expect(utc).toContain("oct");
    expect(utc).not.toContain(":");
    expect(flat(formatMailTime(stamp, { timeZone: "Pacific/Kiritimati", locale: "en-GB", now: later }))).toBe("3:30");
  });

  it("returns an empty string when the date cannot be read", () => {
    expect(formatMailTime("garbage", melbourne)).toBe("");
    expect(formatFullMailTime(null, melbourne)).toBe("");
  });

  it("describes mailbox freshness relative to the viewer's current time", () => {
    const now = new Date("2026-10-10T03:00:00Z");
    expect(formatRefreshAge("2026-10-10T02:59:40Z", { now, locale: "en-AU" })).toBe("just now");
    expect(formatRefreshAge("2026-10-10T02:55:00Z", { now, locale: "en-AU" })).toBe("5 minutes ago");
    expect(formatRefreshAge("2026-10-10T01:00:00Z", { now, locale: "en-AU" })).toBe("2 hours ago");
    expect(formatRefreshAge("2026-10-08T03:00:00Z", { now, locale: "en-AU" })).toBe("2 days ago");
    expect(formatRefreshAge("2026-10-10T02:59:40Z", { now, locale: "zh-CN" })).toBe("刚刚");
    expect(formatRefreshAge("invalid", { now, locale: "en-AU" })).toBe("");
  });
});
