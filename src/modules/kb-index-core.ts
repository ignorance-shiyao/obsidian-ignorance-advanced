/* Knowledge-base index: the pure part. Folder roles, per-note records built from metadata only
   (never the note text), and the aggregates the knowledge views share. */

export type KbArea = "inbox" | "nav" | "work" | "personal" | "knowledge" | "archive" | "other";

export interface KbFolders {
  inbox: string;
  nav: string;
  work: string;
  personal: string;
  knowledge: string;
  archive: string;
  exclude: string[];
}

export interface KbFeatures {
  home: boolean;
  inbox: boolean;
  heatmap: boolean;
  map: boolean;
  timeline: boolean;
  health: boolean;
}

export interface KbThresholds {
  /** Inbox items older than this many days need attention. */
  inboxStaleDays: number;
  /** Overdue tasks above this count need attention. */
  overdueMin: number;
  /** A product line with no change for more than this many days needs attention. */
  productStaleDays: number;
}

export interface KbSettings {
  folders: KbFolders;
  features: KbFeatures;
  thresholds: KbThresholds;
  openHomeOnStartup: boolean;
  /** Health findings the user chose to ignore, as "check:path". */
  ignored: string[];
}

export const KB_DEFAULT_THRESHOLDS: Readonly<KbThresholds> = Object.freeze({ inboxStaleDays: 30, overdueMin: 0, productStaleDays: 14 });

export const KB_DEFAULT_FOLDERS: Readonly<KbFolders> = Object.freeze({
  inbox: "00-收件箱/剪藏",
  nav: "01-导航",
  work: "10-工作",
  personal: "20-个人",
  knowledge: "30-知识",
  archive: "40-归档",
  exclude: ["40-归档/主题样例", ".trash", "Excalidraw"]
});

export const KB_FEATURES: readonly (keyof KbFeatures)[] = ["home", "inbox", "heatmap", "map", "timeline", "health"];

export function cleanFolder(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : "";
}

export function normalizeKbSettings(value: unknown): KbSettings {
  const raw = (typeof value === "object" && value !== null ? value : {}) as {
    folders?: Partial<Record<keyof KbFolders, unknown>>; features?: Partial<Record<keyof KbFeatures, unknown>>;
    thresholds?: Partial<Record<keyof KbThresholds, unknown>>; openHomeOnStartup?: unknown; ignored?: unknown;
  };
  const f = raw.folders ?? {};
  const pick = (key: Exclude<keyof KbFolders, "exclude">) => typeof f[key] === "string" ? cleanFolder(f[key]) : KB_DEFAULT_FOLDERS[key];
  const exclude = Array.isArray(f.exclude) ? f.exclude.map(cleanFolder).filter(Boolean) : [...KB_DEFAULT_FOLDERS.exclude];
  const features = Object.fromEntries(KB_FEATURES.map(key => [key, raw.features?.[key] === true])) as unknown as KbFeatures;
  const count = (key: keyof KbThresholds) => {
    const n = Number(raw.thresholds?.[key]);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : KB_DEFAULT_THRESHOLDS[key];
  };
  return {
    folders: { inbox: pick("inbox"), nav: pick("nav"), work: pick("work"), personal: pick("personal"), knowledge: pick("knowledge"), archive: pick("archive"), exclude },
    features,
    thresholds: { inboxStaleDays: count("inboxStaleDays"), overdueMin: count("overdueMin"), productStaleDays: count("productStaleDays") },
    openHomeOnStartup: raw.openHomeOnStartup === true,
    ignored: Array.isArray(raw.ignored) ? raw.ignored.filter((item): item is string => typeof item === "string") : []
  };
}

export function inFolder(path: string, folder: string): boolean {
  return Boolean(folder) && (path === folder || path.startsWith(folder + "/"));
}

export function isExcluded(path: string, folders: KbFolders): boolean {
  return folders.exclude.some(folder => inFolder(path, folder));
}

const AREA_ORDER: readonly Exclude<KbArea, "other">[] = ["inbox", "nav", "work", "personal", "knowledge", "archive"];

/** The area a path belongs to; the deepest matching folder wins (the inbox may sit inside another area). */
export function areaOf(path: string, folders: KbFolders): KbArea {
  let best: KbArea = "other", depth = -1;
  for (const area of AREA_ORDER) {
    const folder = folders[area];
    if (inFolder(path, folder) && folder.length > depth) { best = area; depth = folder.length; }
  }
  return best;
}

/** The first folder below an area root ("10-工作/5G 管家/x.md" → "10-工作/5G 管家"); "" for notes at the root. */
export function topicOf(path: string, root: string): string {
  if (!inFolder(path, root)) return "";
  const rest = path.slice(root.length + 1).split("/");
  return rest.length > 1 ? `${root}/${rest[0]}` : "";
}

export function basename(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export interface KbNote {
  path: string;
  title: string;
  area: KbArea;
  /** Subfolder of the area root, "" at the root. */
  topic: string;
  ctime: number;
  mtime: number;
  size: number;
  tags: string[];
  /** Resolved outgoing link targets (paths). */
  links: string[];
  unresolved: number;
  unresolvedTargets: string[];
  hasFrontmatter: boolean;
  /** No content besides the frontmatter. */
  bodyEmpty: boolean;
  frontmatter: Record<string, unknown>;
  tasks: number;
  openTasks: number;
  /** Source lines of the open tasks, for reading their 📅 dates. */
  openTaskLines: number[];
}

export interface NoteSource {
  path: string;
  ctime: number;
  mtime: number;
  size: number;
  frontmatter?: Record<string, unknown> | null;
  tags?: readonly string[];
  links?: Readonly<Record<string, number>>;
  unresolved?: Readonly<Record<string, number>>;
  /** Task list items: marker (" " open, "x" done, "-" cancelled…) and source line. */
  tasks?: readonly { mark: string; line: number }[];
  /** Section types from the metadata cache ("yaml", "paragraph", …); undefined when unknown. */
  sections?: readonly string[];
}

/** Open = not ticked and not cancelled. */
export function isOpenTask(mark: string): boolean {
  return mark !== "x" && mark !== "X" && mark !== "-";
}

/** The Tasks plugin due date (📅 YYYY-MM-DD) on a task line, as local midnight; null when absent. */
export function parseTaskDue(line: string): number | null {
  const m = /📅\uFE0F?\s*(\d{4})-(\d{2})-(\d{2})/u.exec(line);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").trim().toLowerCase();
}

/** Frontmatter tags in any of the shapes Obsidian accepts (list, comma string, "tag"/"tags"). */
export function frontmatterTags(frontmatter: Record<string, unknown> | null | undefined): string[] {
  if (!frontmatter) return [];
  const out: string[] = [];
  for (const key of ["tags", "tag"]) {
    const value = frontmatter[key];
    const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
    for (const item of list) if (typeof item === "string" && item.trim()) out.push(normalizeTag(item));
  }
  return out;
}

export function buildNote(source: NoteSource, folders: KbFolders): KbNote {
  const area = areaOf(source.path, folders);
  const root = area === "other" ? "" : folders[area];
  const frontmatter = source.frontmatter ?? {};
  const tags = [...new Set([...frontmatterTags(frontmatter), ...(source.tags ?? []).map(normalizeTag)].filter(Boolean))];
  const tasks = source.tasks ?? [];
  return {
    path: source.path,
    title: basename(source.path),
    area,
    topic: root ? topicOf(source.path, root) : "",
    ctime: source.ctime,
    mtime: source.mtime,
    size: source.size,
    tags,
    links: Object.keys(source.links ?? {}).filter(target => target !== source.path),
    unresolved: Object.values(source.unresolved ?? {}).reduce((sum, n) => sum + n, 0),
    unresolvedTargets: Object.keys(source.unresolved ?? {}),
    hasFrontmatter: Boolean(source.frontmatter && Object.keys(source.frontmatter).length),
    bodyEmpty: source.sections ? source.sections.every(type => type === "yaml") : source.size === 0,
    frontmatter,
    tasks: tasks.length,
    openTasks: tasks.filter(task => isOpenTask(task.mark)).length,
    openTaskLines: tasks.filter(task => isOpenTask(task.mark)).map(task => task.line)
  };
}

/** Incoming links per path, counted once per linking note. */
export function backlinkCounts(notes: Iterable<KbNote>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) for (const target of note.links) counts.set(target, (counts.get(target) ?? 0) + 1);
  return counts;
}

export const DAY = 86_400_000;

/** Local calendar day key "YYYY-MM-DD". */
export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function areaCounts(notes: Iterable<KbNote>): Record<KbArea, number> {
  const counts: Record<KbArea, number> = { inbox: 0, nav: 0, work: 0, personal: 0, knowledge: 0, archive: 0, other: 0 };
  for (const note of notes) counts[note.area]++;
  return counts;
}

/** Notes grouped by topic folder within one area. */
export function topicGroups(notes: Iterable<KbNote>, area: KbArea): Map<string, KbNote[]> {
  const groups = new Map<string, KbNote[]>();
  for (const note of notes) {
    if (note.area !== area || !note.topic) continue;
    const list = groups.get(note.topic);
    if (list) list.push(note); else groups.set(note.topic, [note]);
  }
  return groups;
}
