import MarkdownIt from "markdown-it";
import { parseMarkdownContainers } from "./container-source.js";

const markdown = new MarkdownIt({ html: true });

export interface ChapterRange {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
  tone: number;
}

// Ranges refer to the original source: rendering must preserve source mappings,
// task line numbers and the introduction rather than synthesizing ::: markup.
export function sourceChapterRanges(source: string): ChapterRange[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  const containers = parseMarkdownContainers(source);
  const frontmatterEnd = source.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/)?.[0].length ?? 0;
  const body = source.slice(frontmatterEnd);
  const bodyStarts = [0];
  for (let i = 0; i < body.length; i++) if (body[i] === "\n") bodyStarts.push(i + 1);
  const originalLines = new Map(starts.map((offset, line) => [offset, line]));
  const headings = markdown.parse(body, {})
    .filter(token => token.type === "heading_open" && token.tag === "h2" && token.level === 0 && token.map)
    .map(token => {
      const local = bodyStarts[token.map![0]];
      const offset = frontmatterEnd + local;
      return { offset, line: originalLines.get(offset)! };
    })
    .filter(heading => !containers.some(node => heading.offset >= node.startOffset && heading.offset < node.closeEnd));
  return headings.map((heading, index) => ({
    startOffset: heading.offset,
    endOffset: headings[index + 1]?.offset ?? source.length,
    startLine: heading.line,
    endLine: headings[index + 1]?.line ?? starts.length,
    tone: index % 3,
  }));
}
