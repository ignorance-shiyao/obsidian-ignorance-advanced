// The container names and nesting convention follow MorphDraft's Markdown
// dialect; the parser here is adapted for Obsidian's section post-processors.
// MorphDraft's MIT notice is preserved in ../LICENSE-MorphDraft.txt.
export const CONTAINER_KINDS = new Set([
  "note", "tip", "info", "success", "warning", "danger", "question", "caution", "important",
  "card", "chapter", "panel", "details", "notes", "cols", "col", "timeline", "steps", "kpi",
  "gallery", "process", "matrix", "roadmap"
]);

export interface MarkdownContainer {
  kind: string;
  title: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  contentStart: number;
  contentEnd: number;
  closeEnd: number;
  children: MarkdownContainer[];
}

const OPEN = /^ {0,3}:::\s*([a-z]+)(?:\s+(.+?))?\s*$/i;
const CLOSE = /^ {0,3}:::\s*$/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;

function lineStartsFor(source: string, lines: string[]): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return lines.map((_, index) => starts[index] ?? source.length);
}

function fencedLines(lines: string[]): boolean[] {
  const fenced = new Array(lines.length).fill(false);
  let marker = "";
  let markerLength = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!marker) {
      const opening = line.match(FENCE_OPEN);
      if (opening) {
        marker = opening[1][0];
        markerLength = opening[1].length;
        fenced[index] = true;
      }
      continue;
    }
    fenced[index] = true;
    const closing = line.match(FENCE_CLOSE)?.[1];
    if (closing && closing[0] === marker && closing.length >= markerLength) {
      marker = "";
      markerLength = 0;
    }
  }
  return fenced;
}

function closingLine(lines: string[], fenced: boolean[], start: number, limit: number): number {
  let depth = 1;
  for (let line = start + 1; line < limit; line += 1) {
    if (fenced[line]) continue;
    if (OPEN.test(lines[line])) depth += 1;
    else if (CLOSE.test(lines[line])) {
      depth -= 1;
      if (depth === 0) return line;
    }
  }
  return -1;
}

export function parseMarkdownContainers(source: string): MarkdownContainer[] {
  const lines = source.split("\n");
  const starts = lineStartsFor(source, lines);
  const fenced = fencedLines(lines);

  const parseRange = (firstLine: number, endLine: number): MarkdownContainer[] => {
    const containers: MarkdownContainer[] = [];
    for (let line = firstLine; line < endLine;) {
      if (fenced[line]) { line += 1; continue; }
      const match = lines[line].match(OPEN);
      if (!match || !CONTAINER_KINDS.has(match[1].toLowerCase())) { line += 1; continue; }
      const closeLine = closingLine(lines, fenced, line, endLine);
      if (closeLine < 0) { line += 1; continue; }
      containers.push({
        kind: match[1].toLowerCase(),
        title: (match[2] || "").trim(),
        startLine: line,
        endLine: closeLine,
        startOffset: starts[line],
        contentStart: starts[line + 1] ?? source.length,
        contentEnd: starts[closeLine],
        closeEnd: closeLine + 1 < starts.length ? starts[closeLine + 1] : source.length,
        children: parseRange(line + 1, closeLine)
      });
      line = closeLine + 1;
    }
    return containers;
  };

  return parseRange(0, lines.length);
}
