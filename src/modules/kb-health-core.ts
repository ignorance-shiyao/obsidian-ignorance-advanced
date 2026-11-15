import { backlinkCounts } from "./kb-index-core.js";
import type { KbNote } from "./kb-index-core.js";
import { idleDays } from "./kb-home-core.js";
import { clipSource } from "./kb-inbox-core.js";

/* Note health: the vault's upkeep rules as checks. Each finding is a note; the user can ignore
   findings per check ("check:path" kept in plugin data). */

export type HealthCheck = "broken" | "noSource" | "empty" | "stale" | "orphan" | "remoteImage";
export const HEALTH_CHECKS: readonly HealthCheck[] = ["broken", "noSource", "empty", "stale", "orphan", "remoteImage"];

export interface Finding { check: HealthCheck; path: string; detail: string[] }

export const ignoreKey = (check: HealthCheck, path: string) => `${check}:${path}`;

/** Remote images in Markdown or HTML, outside code: `![](http…)` and `<img src="http…">`. */
export function remoteImages(text: string): string[] {
  const body = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, "").replace(/`[^`\n]*`/g, "");
  const out: string[] = [];
  for (const m of body.matchAll(/!\[[^\]]*\]\(\s*<?(https?:\/\/[^)\s>]+)/gi)) out.push(m[1]);
  for (const m of body.matchAll(/<img\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)/gi)) out.push(m[1]);
  return out;
}

/**
 * - broken: unresolved links (Obsidian already skips code), archive left out
 * - noSource: inbox clippings without `source` / `url`
 * - empty: nothing besides frontmatter
 * - stale: inbox clippings older than `staleDays`
 * - orphan: knowledge notes no other note links to
 * - remoteImage: from `remote` (path → image URLs), read from the text separately
 */
export function runChecks(notes: readonly KbNote[], now: number, staleDays: number, remote: ReadonlyMap<string, readonly string[]> = new Map()): Finding[] {
  const findings: Finding[] = [];
  const backlinks = backlinkCounts(notes);
  for (const note of notes) {
    if (note.area !== "archive" && note.unresolvedTargets.length) findings.push({ check: "broken", path: note.path, detail: note.unresolvedTargets });
    if (note.area === "inbox" && !clipSource(note.frontmatter)) findings.push({ check: "noSource", path: note.path, detail: [] });
    if (note.bodyEmpty) findings.push({ check: "empty", path: note.path, detail: [] });
    if (note.area === "inbox" && idleDays(now, note.ctime) > staleDays) findings.push({ check: "stale", path: note.path, detail: [String(idleDays(now, note.ctime))] });
    if (note.area === "knowledge" && !backlinks.get(note.path)) findings.push({ check: "orphan", path: note.path, detail: [] });
    const images = remote.get(note.path);
    if (images?.length) findings.push({ check: "remoteImage", path: note.path, detail: [...images] });
  }
  return findings;
}

export function groupFindings(findings: readonly Finding[], ignored: ReadonlySet<string>): Record<HealthCheck, { open: Finding[]; ignored: Finding[] }> {
  const groups = Object.fromEntries(HEALTH_CHECKS.map(check => [check, { open: [] as Finding[], ignored: [] as Finding[] }])) as Record<HealthCheck, { open: Finding[]; ignored: Finding[] }>;
  for (const finding of findings) groups[finding.check][ignored.has(ignoreKey(finding.check, finding.path)) ? "ignored" : "open"].push(finding);
  for (const check of HEALTH_CHECKS) groups[check].open.sort((a, b) => a.path.localeCompare(b.path));
  return groups;
}
