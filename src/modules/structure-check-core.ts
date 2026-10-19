/* Structure and typesetting checks on the note source. Read-only reports plus a list of exact text edits for the
   typesetting rules; nothing here touches code, math, links, URLs, front matter or other inline syntax. */
import { parseCaptions } from "./captions.js";

export interface StructureIssue {
  /** 0-based line. */
  line: number;
  kind: "heading-skip" | "broken-ref" | "duplicate-id" | "cjk-space" | "punctuation";
  message: string;
  /** Present when the issue can be repaired automatically. */
  fix?: TextEdit;
}
export interface TextEdit { from: number; to: number; insert: string }

const CJK = "\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uF900-\\uFAFF";
const CJK_CHAR = new RegExp(`[${CJK}]`);
const PROTECTED: RegExp[] = [
  /`[^`\n]*`/g, /\$\$[^$\n]*\$\$/g, /\$[^$\n]+\$/g, /!?\[\[[^\]\n]*\]\]/g, /\]\([^)\n]*\)/g, /<[^>\n]+>/g,
  /https?:\/\/[^\s)）]+/gi, /\{#[\w-]+\}/g, /\(\([^)\n]*\)\)/g, /\[\^[^\]\n]+\]/g, /==|\*\*|__|~~/g
];

/** The line with every protected span replaced by same-length filler, so rules only see ordinary prose. */
export function maskProse(line: string): string {
  let masked = line;
  for (const pattern of PROTECTED) masked = masked.replace(pattern, span => "\u0000".repeat(span.length));
  return masked;
}

const HALF_TO_FULL: Record<string, string> = { ",": "，", ";": "；", "?": "？", "!": "！", ":": "：" };

interface Scan { lines: { text: string; offset: number; prose: boolean; index: number }[] }

/** Splits the source into lines and marks which ones are ordinary text (not front matter, code, math, table rules or container fences). */
function scan(source: string): Scan {
  const lines: Scan["lines"] = [];
  let offset = 0, fence = "", math = false, front = source.startsWith("---\n") || source.startsWith("---\r\n");
  source.split("\n").forEach((raw, index) => {
    const text = raw.replace(/\r$/, "");
    let prose = true;
    if (front) { prose = false; if (index > 0 && /^(?:---|\.\.\.)\s*$/.test(text)) front = false; }
    else if (fence) { prose = false; if (new RegExp(`^\\s*${fence[0]}{${fence.length},}\\s*$`).test(text)) fence = ""; }
    else if (/^\s*(`{3,}|~{3,})/.test(text)) { prose = false; fence = /^\s*(`{3,}|~{3,})/.exec(text)[1]; }
    else if (math) { prose = false; if (/\$\$\s*$/.test(text)) math = false; }
    else if (/^\s*\$\$/.test(text)) { prose = false; if (!/\$\$\s*$/.test(text.replace(/^\s*\$\$/, "")) || text.trim() === "$$") math = text.trim() === "$$" || !/\$\$\s*$/.test(text.slice(text.indexOf("$$") + 2)); }
    else if (/^\s*:{3,}/.test(text) || /^\s*\|?[\s:|-]+\|?\s*$/.test(text) && text.includes("-")) prose = false;
    lines.push({ text, offset, prose, index });
    offset += raw.length + 1;
  });
  return { lines };
}

function typesettingEdits(text: string, offset: number, index: number): StructureIssue[] {
  const masked = maskProse(text);
  const issues: StructureIssue[] = [];
  for (const match of masked.matchAll(new RegExp(`(?<=[${CJK}])(?=[A-Za-z])|(?<=[A-Za-z])(?=[${CJK}])`, "g"))) {
    const at = match.index;
    issues.push({ line: index, kind: "cjk-space", message: `中文与英文之间缺少空格：「${text.slice(Math.max(0, at - 2), at + 2)}」`, fix: { from: offset + at, to: offset + at, insert: " " } });
  }
  for (const match of masked.matchAll(/([㐀-鿿])([,;?!:])(?!\/)/g)) {
    const at = match.index + 1;
    issues.push({ line: index, kind: "punctuation", message: `中文后面用了半角标点「${match[2]}」`, fix: { from: offset + at, to: offset + at + 1, insert: HALF_TO_FULL[match[2]] } });
  }
  for (const match of masked.matchAll(/([㐀-鿿])\.(?=\s|$)/g)) {
    const at = match.index + 1;
    issues.push({ line: index, kind: "punctuation", message: "中文句末用了半角句号「.」", fix: { from: offset + at, to: offset + at + 1, insert: "。" } });
  }
  return issues;
}

export function checkStructure(source: string): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const { lines } = scan(source);
  let previous = 0;
  for (const line of lines) {
    if (!line.prose) continue;
    const heading = /^(#{1,6})\s+\S/.exec(line.text);
    if (heading) {
      const level = heading[1].length;
      if (previous && level > previous + 1) issues.push({ line: line.index, kind: "heading-skip", message: `标题从 H${previous} 直接跳到 H${level}，中间缺一级` });
      previous = level;
    }
    issues.push(...typesettingEdits(line.text, line.offset, line.index));
  }
  const captions = parseCaptions(source);
  const seen = new Map<string, number>();
  for (const caption of captions) {
    if (!caption.id) continue;
    if (seen.has(caption.id)) issues.push({ line: caption.line, kind: "duplicate-id", message: `题注标识「${caption.id}」重复，第一次出现在第 ${seen.get(caption.id) + 1} 行` });
    else seen.set(caption.id, caption.line);
  }
  for (const line of lines) {
    if (!line.prose) continue;
    for (const match of line.text.replace(/`[^`\n]*`/g, span => " ".repeat(span.length)).matchAll(/\(\(ref:([\w-]+)\)\)/g)) {
      if (!seen.has(match[1])) issues.push({ line: line.index, kind: "broken-ref", message: `交叉引用「${match[1]}」找不到对应的题注标识` });
    }
  }
  return issues.sort((a, b) => a.line - b.line);
}

/** The edits from the fixable issues, applied last-to-first so earlier offsets stay valid. Applying twice changes nothing more. */
export function applyEdits(source: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.from - a.from);
  let result = source;
  for (const edit of ordered) result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
  return result;
}

export { CJK_CHAR };
