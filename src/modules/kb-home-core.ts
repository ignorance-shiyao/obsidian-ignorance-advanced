import { DAY, KB_DEFAULT_THRESHOLDS, areaCounts, startOfDay, topicGroups } from "./kb-index-core.js";
import type { KbArea, KbNote, KbThresholds } from "./kb-index-core.js";

/* Knowledge home: the numbers on the dashboard and what needs attention (thresholds in settings,
   defaults: inbox items older than 30 days, more than 0 overdue tasks, a product line idle over 14 days). */

export interface ProductLine { topic: string; name: string; count: number; lastChange: number; idleDays: number; stale: boolean; recent: KbNote[] }

export type AttentionKind = "inbox" | "overdue" | "stale";
export interface Attention { kind: AttentionKind; count: number; paths: string[]; topic?: string }

export interface Dashboard {
  total: number;
  areas: Record<KbArea, number>;
  weekCreated: string[];
  weekModified: string[];
  inbox: string[];
  inboxStale: string[];
  openTasks: string[];
  openTaskCount: number;
  dueToday: string[];
  dueTodayCount: number;
  overdue: string[];
  overdueCount: number;
  products: ProductLine[];
  attention: Attention[];
  recent: KbNote[];
}

export function idleDays(now: number, time: number): number {
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(time)) / DAY));
}

const byTime = (key: "ctime" | "mtime", dir = -1) => (a: KbNote, b: KbNote) => dir * (a[key] - b[key]);

/** `dues`: per note, the 📅 date of each open task (null when it has none). */
export function computeDashboard(notes: readonly KbNote[], now: number, dues: ReadonlyMap<string, readonly (number | null)[]> = new Map(), thresholds: KbThresholds = KB_DEFAULT_THRESHOLDS, recentCount = 10): Dashboard {
  const today = startOfDay(now);
  const weekAgo = today - 6 * DAY;
  const paths = (list: KbNote[]) => list.map(note => note.path);
  const inbox = notes.filter(note => note.area === "inbox").sort(byTime("ctime", 1));
  const inboxStale = inbox.filter(note => idleDays(now, note.ctime) > thresholds.inboxStaleDays);

  const withTasks = notes.filter(note => note.openTasks > 0).sort(byTime("mtime"));
  const dueToday: string[] = [], overdue: string[] = [];
  let dueTodayCount = 0, overdueCount = 0;
  for (const note of withTasks) {
    const list = dues.get(note.path) ?? [];
    const late = list.filter(due => due !== null && due < today).length;
    const todayN = list.filter(due => due === today).length;
    if (late) { overdue.push(note.path); overdueCount += late; }
    if (todayN) { dueToday.push(note.path); dueTodayCount += todayN; }
  }

  const products: ProductLine[] = [...topicGroups(notes, "work")].map(([topic, list]) => {
    const sorted = [...list].sort(byTime("mtime"));
    const lastChange = sorted[0].mtime;
    const idle = idleDays(now, lastChange);
    return { topic, name: topic.slice(topic.lastIndexOf("/") + 1), count: list.length, lastChange, idleDays: idle, stale: idle > thresholds.productStaleDays, recent: sorted.slice(0, 3) };
  }).sort((a, b) => b.lastChange - a.lastChange);

  const attention: Attention[] = [];
  if (inboxStale.length) attention.push({ kind: "inbox", count: inboxStale.length, paths: paths(inboxStale) });
  if (overdueCount > thresholds.overdueMin) attention.push({ kind: "overdue", count: overdueCount, paths: overdue });
  for (const line of products) if (line.stale) attention.push({ kind: "stale", count: line.idleDays, paths: paths(line.recent), topic: line.topic });

  return {
    total: notes.length,
    areas: areaCounts(notes),
    weekCreated: paths(notes.filter(note => note.ctime >= weekAgo).sort(byTime("ctime"))),
    weekModified: paths(notes.filter(note => note.mtime >= weekAgo).sort(byTime("mtime"))),
    inbox: paths(inbox),
    inboxStale: paths(inboxStale),
    openTasks: paths(withTasks),
    openTaskCount: withTasks.reduce((sum, note) => sum + note.openTasks, 0),
    dueToday, dueTodayCount, overdue, overdueCount,
    products,
    attention,
    recent: [...notes].sort(byTime("mtime")).slice(0, recentCount)
  };
}
