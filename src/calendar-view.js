const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

export function validDateKey(value) {
  const match = ISO_DATE.exec(String(value || ""));
  if (!match) return "";
  const [, year, month, day, hour, minute] = match;
  if (hour && (Number(hour) > 23 || Number(minute) > 59)) return "";
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return candidate.getUTCFullYear() === Number(year)
    && candidate.getUTCMonth() === Number(month) - 1
    && candidate.getUTCDate() === Number(day)
    ? `${year}-${month}-${day}`
    : "";
}

export function eventDateKey(event) {
  return validDateKey(event?.start) || validDateKey(event?.date);
}

export function monthKeyForEvents(events, preferredMonth = "", now = new Date()) {
  const preferred = ISO_MONTH.exec(preferredMonth);
  if (preferred && Number(preferred[2]) >= 1 && Number(preferred[2]) <= 12) return preferredMonth;
  const firstResolved = (events || []).map(eventDateKey).find(Boolean);
  if (firstResolved) return firstResolved.slice(0, 7);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(monthKey, amount) {
  const match = ISO_MONTH.exec(monthKey);
  if (!match) return monthKey;
  const date = new Date(Number(match[1]), Number(match[2]) - 1 + amount, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function calendarCells(monthKey) {
  const match = ISO_MONTH.exec(monthKey);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push({
      day,
      key: `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    });
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}
