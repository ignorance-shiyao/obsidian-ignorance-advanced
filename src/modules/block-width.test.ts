import { describe, expect, it } from "vitest";
import { chartWidth, withChartWidth } from "./block-width.js";
import { parseHighlightedCodeLines } from "./code-lines.js";

describe("block width marker", () => {
  it("reads and writes the fence width", () => {
    expect(chartWidth("```mermaid {align=center} {width=480}")).toBe(480);
    expect(chartWidth("```mermaid")).toBe(0);
    expect(withChartWidth("```js {width=300} {align=left}", 520)).toBe("```js {align=left} {width=520}");
    expect(withChartWidth("```js {width=300}", 0)).toBe("```js");
  });
  it("does not disturb highlighted line ranges", () => {
    expect(parseHighlightedCodeLines("```js {1,3} {align=left} {width=400}")).toEqual([1, 3]);
  });
});
