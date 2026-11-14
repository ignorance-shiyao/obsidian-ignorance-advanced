import { parseDateValue, validDate } from "./kb-date-core.js";
import { topicOf } from "./kb-index-core.js";
import type { KbNote } from "./kb-index-core.js";

/* Project timeline: a date for each work note, its product line (lane) and its kind (the subfolder). */

export interface DateSource { name: string; frontmatter: Record<string, unknown>; ctime: number }

/**
 * The date a note is about, by priority:
 * 1. frontmatter `date`, then `created`;
 * 2. a full date in the file name: YYYY-MM-DD (or YYYY.MM.DD, YYYY_MM_DD) or YYYYMMDD;
 * 3. a 4-digit MMDD in the file name, with the year of `yearHint` (the year most of the folder's dated
 *    notes carry) or else the year of the file's ctime;
 * 4. null: the note stays off the timeline.
 * Digit runs longer than the pattern (phone numbers, versions) are not read as dates.
 */
export function extractDate(file: DateSource, yearHint?: number): number | null {
  for (const key of ["date", "created"]) {
    const value = parseDateValue(file.frontmatter[key]);
    if (value !== null) return value;
  }
  const name = file.name;
  for (const m of name.matchAll(/(?<!\d)(\d{4})[-._](\d{1,2})[-._](\d{1,2})(?!\d)/g)) {
    const t = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
    if (t !== null) return t;
  }
  for (const m of name.matchAll(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g)) {
    const year = Number(m[1]);
    const t = year >= 1990 && year <= 2100 ? validDate(year, Number(m[2]), Number(m[3])) : null;
    if (t !== null) return t;
  }
  for (const m of name.matchAll(/(?<!\d)(\d{2})(\d{2})(?!\d)/g)) {
    const t = validDate(yearHint ?? new Date(file.ctime).getFullYear(), Number(m[1]), Number(m[2]));
    if (t !== null) return t;
  }
  return null;
}

/** "05-进度与会议" → "进度与会议". */
export function kindName(folder: string): string {
  return folder.replace(/^\d+[-_.\s]+/, "") || folder;
}

export interface TimelineItem { path: string; title: string; lane: string; kind: string; time: number }
export interface Timeline { items: TimelineItem[]; undated: string[]; lanes: string[]; kinds: string[]; years: number[] }

/** Work notes on lanes (first-level folders of `workRoot`), kind = the folder below the lane. */
export function buildTimeline(notes: readonly KbNote[], workRoot: string): Timeline {
  const work = notes.filter(note => note.area === "work" && topicOf(note.path, workRoot));
  // Year hint per folder: the most common year among notes with a full date.
  const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/"));
  const years = new Map<string, Map<number, number>>();
  for (const note of work) {
    const full = extractDate({ name: note.title, frontmatter: note.frontmatter, ctime: Number.NaN });
    if (full === null || Number.isNaN(full)) continue;
    const counts = years.get(folderOf(note.path)) ?? new Map<number, number>();
    const y = new Date(full).getFullYear();
    counts.set(y, (counts.get(y) ?? 0) + 1);
    years.set(folderOf(note.path), counts);
  }
  const hint = (path: string) => {
    const counts = years.get(folderOf(path));
    return counts ? [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] : undefined;
  };
  const items: TimelineItem[] = [], undated: string[] = [];
  for (const note of work) {
    const time = extractDate({ name: note.title, frontmatter: note.frontmatter, ctime: note.ctime }, hint(note.path));
    if (time === null) { undated.push(note.path); continue; }
    const lane = topicOf(note.path, workRoot);
    const rest = note.path.slice(lane.length + 1).split("/");
    items.push({ path: note.path, title: note.title, lane: lane.slice(lane.lastIndexOf("/") + 1), kind: rest.length > 1 ? kindName(rest[0]) : "", time });
  }
  items.sort((a, b) => a.time - b.time);
  const uniq = <T,>(list: T[]) => [...new Set(list)];
  return {
    items, undated,
    lanes: uniq(items.map(item => item.lane)).sort((a, b) => a.localeCompare(b)),
    kinds: uniq(items.map(item => item.kind)).sort((a, b) => a.localeCompare(b)),
    years: uniq(items.map(item => new Date(item.time).getFullYear())).sort((a, b) => b - a)
  };
}

export function filterTimeline(items: readonly TimelineItem[], lane: string, year: number | null): TimelineItem[] {
  return items.filter(item => (!lane || item.lane === lane) && (year === null || new Date(item.time).getFullYear() === year));
}
