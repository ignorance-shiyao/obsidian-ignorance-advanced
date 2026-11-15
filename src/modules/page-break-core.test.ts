import { describe, expect, it } from "vitest";
import { isPageBreakText } from "./page-break-core.js";
import { paginateStrip } from "./pagination.js";

describe("isPageBreakText", () => {
  it("matches the bare marker with surrounding blanks", () => {
    expect(isPageBreakText("---page")).toBe(true);
    expect(isPageBreakText("  ---page \n")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isPageBreakText("---")).toBe(false);
    expect(isPageBreakText("--- page")).toBe(false);
    expect(isPageBreakText("text ---page")).toBe(false);
    expect(isPageBreakText(null)).toBe(false);
  });
});

const block = (top: number, bottom: number, extra: Record<string, unknown> = {}) => ({ top, bottom, atomic: false, breakpoints: [] as number[], leadIn: false, ...extra });

describe("paginateStrip with breakBefore", () => {
  it("cuts at a forced break even though the page has room", () => {
    const blocks = [block(0, 100), block(110, 200), block(210, 300, { breakBefore: true }), block(310, 400)];
    const windows = paginateStrip(blocks, 1000, "default");
    expect(windows.length).toBe(2);
    expect(windows[0].stop).toBe(210);
    expect(windows[1].start).toBe(210);
  });
  it("ignores a break at the very start of a page", () => {
    const blocks = [block(0, 100, { breakBefore: true }), block(110, 200)];
    expect(paginateStrip(blocks, 1000, "default").length).toBe(1);
  });
  it("still splits by height when no break is given", () => {
    const blocks = [block(0, 400), block(410, 800), block(810, 1200)];
    expect(paginateStrip(blocks, 1000, "default").length).toBeGreaterThan(1);
  });
  it("handles two breaks in a row without an empty page", () => {
    const blocks = [block(0, 100), block(110, 200, { breakBefore: true }), block(210, 300, { breakBefore: true })];
    const windows = paginateStrip(blocks, 1000, "default");
    expect(windows.map(w => [w.start, w.stop])).toEqual([[0, 110], [110, 210], [210, 300]]);
  });
});
