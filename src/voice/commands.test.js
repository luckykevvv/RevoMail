import { expect, it } from "vitest";
import { parseCommand, validateCommand } from "./commands.js";

it.each(["Summarise the current email", "summarize current email.", " SUMMARIZE   THE CURRENT EMAIL "])("recognises %s", text => expect(parseCommand(text)).toBe("summary"));
it.each(["send email", "show tasks and delete email", "please do something", "show tasks; send", "summarise newest email"])("rejects %s", text => expect(parseCommand(text)).toBeNull());
it("requires a stable explicit email target", () => {
  expect(() => validateCommand("generate a reply", "old", "new")).toThrow();
  expect(() => validateCommand("summarize current email", null, null)).toThrow();
  expect(validateCommand("show my tasks", null, null)).toBe("tasks");
});
