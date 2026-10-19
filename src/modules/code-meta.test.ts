import { describe, expect, it } from "vitest";
import { diffLineKind, parseCodeMeta } from "./code-meta";
import { parseHighlightedCodeLines } from "./code-lines";

describe("code fence options", () => {
  it("reads title, start and wrap in any order", () => {
    expect(parseCodeMeta("```js title:\"src/app.js\" start=10 wrap")).toEqual({ title: "src/app.js", start: 10, wrap: true });
    expect(parseCodeMeta("~~~python nowrap start:3 title='a b.py'")).toEqual({ title: "a b.py", start: 3, wrap: false });
  });
  it("ignores fences without options and other text", () => {
    expect(parseCodeMeta("```js")).toEqual({});
    expect(parseCodeMeta("not a fence title:\"x\"")).toEqual({});
    expect(parseCodeMeta("```js title:\"\"")).toEqual({});
    expect(parseCodeMeta("```wrapper")).toEqual({});
  });
  it("keeps highlighted lines working next to the new options", () => {
    expect(parseHighlightedCodeLines("```js title:\"a.js\" start=5 {2-4}")).toEqual([2, 3, 4]);
  });
  it("classifies diff lines", () => {
    expect(diffLineKind("+added")).toBe("add");
    expect(diffLineKind("-removed")).toBe("del");
    expect(diffLineKind("--- a/file")).toBeNull();
    expect(diffLineKind("+++ b/file")).toBeNull();
    expect(diffLineKind(" context")).toBeNull();
  });
});
