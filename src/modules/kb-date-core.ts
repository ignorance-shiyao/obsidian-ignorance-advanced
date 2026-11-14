/* Dates read from frontmatter values and file names. */

/** A frontmatter date ("YYYY-MM-DD…", "YYYY/M/D", a number or a Date) as local midnight / time; null when unreadable. */
export function parseDateValue(value: unknown): number | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const m = /^\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(value);
  return m ? validDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** Local midnight of a calendar date, or null when the day does not exist (2026-02-30). */
export function validDate(year: number, month: number, day: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d.getTime() : null;
}

/** "YYYY-MM-DD" in local time. */
export function formatDay(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
