/* Tab groups: a line holding only `_^tab^_` turns the tables, pictures, code blocks and quotes right after it into
   tabs (two or more are needed). A line `*==title==*` right before a member names its tab. Pure source analysis; the
   DOM side is tab-groups.ts. */
export type TabKind = "table" | "image" | "code" | "quote";
export interface TabMember { start: number; end: number; kind: TabKind; title: string; captionAt?: number }
export interface TabGroup { marker: number; members: TabMember[] }

const MARKER = /^_\^tab\^_\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const QUOTE = /^ {0,3}>/;
const IMAGE = /^!\[([^\]]*)\]\([^)]*\)\s*$/;
const WIKI_IMAGE = /^!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/;
const CAPTION = /^\*==(.+?)==\*\s*$/;
const blank = (line: string | undefined) => line !== undefined && !line.trim();
const isTableLine = (line: string | undefined) => line !== undefined && line.includes("|") && line.trim().length > 0;
const isSeparator = (line: string | undefined) => line !== undefined && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line);

const cleanCell = (cell: string) => cell.replace(/[*_`~=]/g, "").trim();
const baseName = (path: string) => (path.split("/").pop() || path).replace(/\.[^.]+$/, "");

function applyCaption(members: TabMember[], before: number, captionAt: number | undefined, caption: string) {
  const member = members[before];
  if (!member || captionAt === undefined) return;
  member.captionAt = captionAt;
  if (caption) member.title = caption;
}

/** The tables, pictures, fenced code and quotes that directly follow `from`, with their first and last lines and a short title. */
function membersAfter(lines: string[], from: number): TabMember[] {
  const members: TabMember[] = [];
  let at = from + 1;
  while (at < lines.length) {
    while (blank(lines[at])) at++;
    if (at >= lines.length) break;
    let line = lines[at];
    // A caption line names the member after it; the trailing `_note_` part of the caption is not part of the name.
    let captionAt: number | undefined;
    let caption = "";
    const named = CAPTION.exec(line.trim());
    if (named) {
      captionAt = at;
      caption = named[1].replace(/_[^_]*_\s*$/, "").trim();
      at++;
      while (blank(lines[at])) at++;
      if (at >= lines.length) break;
      line = lines[at];
    }
    const before = members.length;
    const fence = FENCE.exec(line);
    if (fence) {
      let end = at + 1;
      while (end < lines.length && !new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[end])) end++;
      if (end >= lines.length) break;
      members.push({ start: at, end, kind: "code", title: fence[2] });
      at = end + 1;
      applyCaption(members, before, captionAt, caption);
      continue;
    }
    if (isTableLine(line) && isSeparator(lines[at + 1])) {
      let end = at + 1;
      while (isTableLine(lines[end + 1])) end++;
      const first = line.trim().replace(/^\||\|$/g, "").split("|").map(cleanCell).find(Boolean) ?? "";
      members.push({ start: at, end, kind: "table", title: first });
      at = end + 1;
      applyCaption(members, before, captionAt, caption);
      continue;
    }
    const image = IMAGE.exec(line.trim()) ?? WIKI_IMAGE.exec(line.trim());
    if (image) {
      const wiki = line.trim().startsWith("![[");
      members.push({ start: at, end: at, kind: "image", title: wiki ? baseName(image[1]) : image[1].split("|")[0].trim() });
      at += 1;
      applyCaption(members, before, captionAt, caption);
      continue;
    }
    if (QUOTE.test(line)) {
      let end = at;
      while (end + 1 < lines.length && QUOTE.test(lines[end + 1])) end++;
      const bold = /\*\*([^*]+)\*\*/.exec(lines.slice(at, end + 1).join("\n"));
      members.push({ start: at, end, kind: "quote", title: bold ? bold[1].trim() : "" });
      at = end + 1;
      applyCaption(members, before, captionAt, caption);
      continue;
    }
    break;
  }
  return members;
}

/** Every tab group in the note. A marker inside a fenced block is only text, and a group needs two members or more. */
export function findTabGroups(lines: string[]): TabGroup[] {
  const groups: TabGroup[] = [];
  let fence: string | null = null;
  for (let at = 0; at < lines.length; at++) {
    const opening = FENCE.exec(lines[at]);
    if (fence) {
      if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(lines[at])) fence = null;
      continue;
    }
    if (opening) { fence = opening[1]; continue; }
    if (!MARKER.test(lines[at])) continue;
    const members = membersAfter(lines, at);
    if (members.length >= 2) groups.push({ marker: at, members });
  }
  return groups;
}

export type TabRole = { role: "bar"; group: TabGroup } | { role: "member"; group: TabGroup; index: number } | null;

/** What the section that starts at `line` is in a group: the tab bar, a tab, or neither. */
export function tabRoleAt(groups: TabGroup[], line: number): TabRole {
  for (const group of groups) {
    if (group.marker === line) return { role: "bar", group };
    const index = group.members.findIndex(member => member.start === line || member.captionAt === line);
    if (index >= 0) return { role: "member", group, index };
  }
  return null;
}
