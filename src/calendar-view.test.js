import { describe, expect, it } from "vitest";
import { calendarCells, eventDateKey, monthKeyForEvents, shiftMonth, validDateKey } from "./calendar-view.js";

describe("calendar view helpers", () => {
  it("uses only real resolved event dates", () => {
    expect(eventDateKey({ start: "2026-10-12T14:00", date: "tomorrow" })).toBe("2026-10-12");
    expect(eventDateKey({ start: null, date: "2026-02-29" })).toBe("");
    expect(eventDateKey({ start: null, date: "tomorrow" })).toBe("");
    expect(eventDateKey({ start: "2026-10-12T25:00" })).toBe("");
    expect(eventDateKey({ date: "2026-10-12 maybe" })).toBe("");
    expect(validDateKey("2028-02-29")).toBe("2028-02-29");
  });

  it("selects an event month, navigates across years, and builds a six-week grid", () => {
    expect(monthKeyForEvents([{ start: "2026-10-12" }], "", new Date(2025, 0, 1))).toBe("2026-10");
    expect(monthKeyForEvents([], "", new Date(2025, 0, 1))).toBe("2025-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    const cells = calendarCells("2026-10");
    expect(cells).toHaveLength(42);
    expect(cells.find(cell => cell?.key === "2026-10-12")).toEqual({ day: 12, key: "2026-10-12" });
  });
});
