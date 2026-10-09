import { describe, expect, it } from "vitest";
import { sourceChapterRanges } from "./chapter-source.js";

describe("ordinary Markdown chapter boundaries", () => {
  it("preserves introduction and original source offsets, cycling three tones", () => {
    const source = "# Book\n\nIntroduction\n\n## A\ntext\n### Child\nmore\n## B\nb\n## C\nc\n## D\nd";
    const ranges = sourceChapterRanges(source);
    expect(ranges.map(r => r.tone)).toEqual([0, 1, 2, 0]);
    expect(source.slice(0, ranges[0].startOffset)).toBe("# Book\n\nIntroduction\n\n");
    expect(ranges.map(r => source.slice(r.startOffset, r.endOffset)).join("")).toBe(source.slice(ranges[0].startOffset));
    expect(source.slice(ranges[0].startOffset, ranges[0].endOffset)).toContain("### Child");
  });
  it("ignores fenced, quoted, list and explicit container headings", () => {
    const source = "```md\n## Code\n```\n> ## Quote\n\n- item\n  ## List\n\n:::chapter\n## Explicit\n:::details\n## Nested\n:::\n:::\n\n## Real\nbody";
    expect(sourceChapterRanges(source).map(r => source.slice(r.startOffset, r.endOffset))).toEqual(["## Real\nbody"]);
  });
  it("supports Setext headings, CRLF and frontmatter without counting metadata", () => {
    const source = "---\r\ntitle: Example\r\n---\r\nIntro\r\n\r\nFirst\r\n-----\r\nbody\r\n## Second\r\nend";
    const ranges = sourceChapterRanges(source);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].startLine).toBe(5);
    expect(source.slice(ranges[0].startOffset, ranges[0].endOffset)).toBe("First\r\n-----\r\nbody\r\n");
    expect(ranges[1].startLine).toBe(8);
  });
  it("leaves notes without H2 unchanged", () => {
    expect(sourceChapterRanges("# Title\nparagraph\n### Small")).toEqual([]);
  });
});
