import type { RenderingContext } from "../rendering-context.js";
/* Obsidian only starts a table when a blank line (or another block) comes right before it; typed straight under
   a paragraph, the rows stay plain text. These helpers find that mistake so the table can still be recognised:
   virtually in Reading view and exports, and by inserting the blank line while editing. */

const FENCE = /^\s*(`{3,}|~{3,})(.*)$/;
// A previous line that already ends its block, or that a table may follow without a blank line.
const BLOCK_END = /^\s{0,3}(?:#{1,6}(?:\s|$)|>|[-*_]{3,}\s*$|<|\$\$|\||:::|\[\^[^\]]+\]:)/;

function cells(line: string): number {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).length;
}

const isDelimiter = (line: string) => /^\s{0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes("|") || /^\s{0,3}\|?\s*:?-+:?\s*\|\s*$/.test(line);

function isHeader(line: string, next: string | undefined): boolean {
  if (next === undefined || !/^\s{0,3}\S/.test(line) || !line.includes("|") || !isDelimiter(next)) return false;
  return cells(line) === cells(next);
}

/** Line indexes that need a blank line inserted before them so that a table starting there is recognised. */
export function missingBlankLines(lines: string[], from = 0, to = lines.length): number[] {
  const found: number[] = [];
  let fence = "";
  let math = false;
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) start = end + 1;
  }
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = FENCE.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
      continue;
    }
    if (marker) { fence = marker[1]; continue; }
    if (/^\s*\$\$/.test(line) && !/^\s*\$\$.+\$\$\s*$/.test(line)) { math = !math; continue; }
    if (math || index < from || index >= to || index === start) continue;
    const before = lines[index - 1];
    if (!before.trim() || BLOCK_END.test(before) || FENCE.test(before)) continue;
    if (isHeader(line, lines[index + 1])) found.push(index);
  }
  return found;
}

/** The text with the missing blank lines added. */
export function withBlankLines(text: string): string {
  const lines = text.split("\n");
  const at = missingBlankLines(lines);
  if (!at.length) return text;
  const marks = new Set(at);
  const out: string[] = [];
  lines.forEach((line, index) => { if (marks.has(index)) out.push(""); out.push(line); });
  return out.join("\n");
}

export function wantsLenient(plugin: RenderingContext): boolean {
  return plugin?.state?.lenientBlocks !== false;
}
