import { expect, it } from "vitest";
import { chunkSpeech, filterCandidates, parseCommand, parseOrdinal, validateCommand } from "./commands.js";

it.each(["Summarise the current email", "summarize current email.", " SUMMARIZE   THE CURRENT EMAIL "])("recognises %s", text => expect(parseCommand(text)).toBe("summary"));
it.each(["send email", "show tasks and delete email", "please do something", "show tasks; send", "summarise newest email"])("rejects %s", text => expect(parseCommand(text)).toBeNull());
it("requires a stable explicit email target", () => {
  expect(() => validateCommand("generate a reply", "old", "new")).toThrow();
  expect(() => validateCommand("summarize current email", null, null)).toThrow();
  expect(validateCommand("show my tasks", null, null)).toBe("tasks");
});
it.each([["the second one", 1], ["number 5", 4], ["third", 2], ["the first email", 0]])("parses ordinal %s", (text, index) => expect(parseOrdinal(text)).toBe(index));
it("ranks candidates by priority then newest and applies safe fields", () => {
  const messages = [
    { id: "1", sender: "Alex", subject: "Old", preview: "project", priority: "high", receivedAt: "2026-01-01T00:00:00Z", unread: true },
    { id: "2", sender: "Alex", subject: "New", preview: "project", priority: "high", receivedAt: "2026-02-01T00:00:00Z", unread: true },
    { id: "3", sender: "Alex", subject: "Low", preview: "project", priority: "low", receivedAt: "2026-03-01T00:00:00Z", unread: true },
  ];
  expect(filterCandidates(messages, { sender: "alex", terms: "project", unread: true }).map(item => item.id)).toEqual(["2", "1", "3"]);
});
it("chunks long speech without losing content", () => {
  const chunks = chunkSpeech(`${"Sentence. ".repeat(700)}`, 200);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every(chunk => chunk.length <= 200)).toBe(true);
  expect(chunks.join(" ").replace(/\s+/g, " ").trim()).toBe("Sentence. ".repeat(700).trim());
});
