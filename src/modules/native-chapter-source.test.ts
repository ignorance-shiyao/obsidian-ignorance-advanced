import { expect, it } from "vitest";
import { chapterForSection } from "./native-chapter-source.js";
import { sourceChapterRanges } from "./chapter-source.js";

it("assigns only sections wholly within one source chapter", () => {
  const ranges = sourceChapterRanges("# Book\nintro\n\n## First\ntext\n\n## Second\nend");
  expect(chapterForSection(ranges, 0, 2)).toBe(-1);
  expect(chapterForSection(ranges, 3, 3)).toBe(0);
  expect(chapterForSection(ranges, 4, 5)).toBe(0);
  expect(chapterForSection(ranges, 5, 6)).toBe(-1);
  expect(chapterForSection(ranges, 6, 7)).toBe(1);
  expect(chapterForSection(ranges, -1, 0)).toBe(-1);
});
