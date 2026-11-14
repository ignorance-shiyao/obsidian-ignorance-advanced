import { DAY, basename, inFolder, startOfDay } from "./kb-index-core.js";
import type { KbNote } from "./kb-index-core.js";
import { parseDateValue } from "./kb-date-core.js";

/* Inbox digest: the queue, topic suggestions and the text edits behind each action. */

export const KB_SNOOZE_KEY = "inbox-snooze";
export const KB_SNOOZE_DAYS = 7;
export const KB_CLIP_HEADING = "剪藏";
export const KB_ARCHIVE_SUBFOLDER = "剪藏原稿";

const STOP = new Set(["the", "and", "for", "with", "how", "what", "why", "you", "your", "are", "from", "this", "that", "一个", "我们", "什么", "怎么", "如何", "为什么", "可以", "以及", "关于", "md"]);

/** Search keys of a text: Latin words (2+ letters) and Chinese character pairs. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/[a-z][a-z0-9+#.-]*[a-z0-9+#]|[a-z]{2,}/g)) if (m[0].length >= 2 && !STOP.has(m[0])) out.push(m[0]);
  for (const run of lower.match(/[一-鿿]+/g) ?? []) {
    if (run.length === 1) continue;
    for (let i = 0; i < run.length - 1; i++) {
      const pair = run.slice(i, i + 2);
      if (!STOP.has(pair)) out.push(pair);
    }
  }
  return out;
}

export interface TopicProfile {
  /** Folder path, e.g. "30-知识/AI 与 Agent". */
  path: string;
  name: string;
  /** The topic page: the note named after the folder, else the folder's first note. */
  page: string | null;
  notes: Set<string>;
  /** Keyword weights: folder name ×3, tags ×2, note titles ×1 (each capped). */
  keywords: Map<string, number>;
}

function add(map: Map<string, number>, key: string, weight: number, cap: number) {
  map.set(key, Math.min(cap, (map.get(key) ?? 0) + weight));
}

/** Pick the topic page among a folder's notes. */
export function topicPage(folder: string, paths: readonly string[]): string | null {
  const name = folder.slice(folder.lastIndexOf("/") + 1);
  const own = paths.find(path => path === `${folder}/${name}.md`) ?? paths.find(path => basename(path) === name);
  if (own) return own;
  const sorted = [...paths].sort((a, b) => (a.split("/").length - b.split("/").length) || a.localeCompare(b));
  return sorted[0] ?? null;
}

/** First-level folders of `root` (from the folder list, so empty topics count) with their notes. */
export function buildTopics(folders: readonly string[], notes: readonly KbNote[], root: string): TopicProfile[] {
  const topics = new Map<string, TopicProfile>();
  for (const folder of folders) {
    if (!inFolder(folder, root) || folder === root || folder.slice(root.length + 1).includes("/")) continue;
    const name = folder.slice(root.length + 1);
    const keywords = new Map<string, number>();
    for (const token of tokenize(name)) add(keywords, token, 3, 6);
    topics.set(folder, { path: folder, name, page: null, notes: new Set(), keywords });
  }
  for (const note of notes) {
    for (const topic of topics.values()) {
      if (!inFolder(note.path, topic.path)) continue;
      topic.notes.add(note.path);
      for (const tag of note.tags) for (const token of tokenize(tag)) add(topic.keywords, token, 2, 6);
      for (const token of tokenize(note.title)) add(topic.keywords, token, 1, 4);
    }
  }
  for (const topic of topics.values()) topic.page = topicPage(topic.path, [...topic.notes]);
  return [...topics.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface SuggestInput { title: string; tags: readonly string[]; links: readonly string[]; backlinks: readonly string[] }
export interface Suggestion { topic: TopicProfile; score: number }

/** Link weight: one link into or out of a topic's notes outweighs a shared keyword. */
export const KB_LINK_WEIGHT = 4;

/**
 * Topic suggestions, best first, at most `limit`: keyword overlap of the note's title and tags with the
 * topic's name, tags and note titles, plus KB_LINK_WEIGHT for each link between the note and the topic.
 */
export function suggestTopics(note: SuggestInput, topics: readonly TopicProfile[], limit = 3): Suggestion[] {
  const tokens = new Set([...tokenize(note.title), ...note.tags.flatMap(tokenize)]);
  const scored: Suggestion[] = [];
  for (const topic of topics) {
    let score = 0;
    for (const token of tokens) score += topic.keywords.get(token) ?? 0;
    for (const path of [...note.links, ...note.backlinks]) if (topic.notes.has(path)) score += KB_LINK_WEIGHT;
    if (score > 0) scored.push({ topic, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.topic.name.localeCompare(b.topic.name)).slice(0, limit);
}

/** Snoozed until KB_SNOOZE_DAYS after the date written in frontmatter. */
export function isSnoozed(frontmatter: Record<string, unknown>, now: number): boolean {
  const since = parseDateValue(frontmatter[KB_SNOOZE_KEY]);
  return since !== null && startOfDay(now) < since + KB_SNOOZE_DAYS * DAY;
}

/** Inbox notes to digest, oldest first. */
export function inboxQueue(notes: readonly KbNote[], now: number): KbNote[] {
  return notes.filter(note => note.area === "inbox" && !isSnoozed(note.frontmatter, now)).sort((a, b) => a.ctime - b.ctime || a.path.localeCompare(b.path));
}

export function clipSource(frontmatter: Record<string, unknown>): string {
  for (const key of ["source", "url", "来源", "link"]) {
    const value = frontmatter[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  return "";
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\s*(\r?\n|$)/, "");
}

/** The description, else the first `max` characters of readable body text. */
export function clipSummary(frontmatter: Record<string, unknown>, text: string, max = 200): string {
  const description = frontmatter.description;
  if (typeof description === "string" && description.trim()) return description.trim();
  const plain = stripFrontmatter(text)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)|!\[\[[^\]]*\]\]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~=]+/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...plain].length > max ? [...plain].slice(0, max).join("") + "…" : plain;
}

export function clipLine(link: string, conclusion: string): string {
  const text = conclusion.trim().replace(/\s+/g, " ");
  return text ? `- ${link} — ${text}` : `- ${link}`;
}

/** Appends `line` at the end of the `## heading` section, creating the section at the end when missing. */
export function appendUnderHeading(text: string, heading: string, line: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex(l => new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`).test(l));
  if (start < 0) {
    const body = text.replace(/\s+$/, "");
    return `${body}${body ? "\n\n" : ""}## ${heading}\n\n${line}\n`;
  }
  let end = lines.length;
  let fence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && /^#{1,2}\s/.test(lines[i])) { end = i; break; }
  }
  const section = lines.slice(start + 1, end);
  while (section.length && section[section.length - 1].trim() === "") section.pop();
  if (!section.length) section.push("");
  const rest = lines.slice(end);
  while (rest.length && rest[rest.length - 1].trim() === "") rest.pop();
  return [...lines.slice(0, start + 1), ...section, line, ...(rest.length ? ["", ...rest] : [])].join("\n") + "\n";
}

/** `folder/name.md`, or `folder/name 2.md`… when taken. */
export function uniquePath(folder: string, name: string, exists: (path: string) => boolean): string {
  const base = folder ? `${folder}/` : "";
  let path = `${base}${name}.md`;
  for (let n = 2; exists(path); n++) path = `${base}${name} ${n}.md`;
  return path;
}
