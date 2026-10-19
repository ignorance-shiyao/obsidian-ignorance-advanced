import { describe, expect, it } from "vitest";
import { applyLayout, exportLayouts, importLayouts, layoutChanges, sanitizeLayout, snapshotLayout, uniqueLayoutName, type PageLike } from "./layout-library-core";

const page = (): PageLike => ({
  width: "standard", customWidth: 80, paged: true, paper: "A4", customPaper: { w: 210, h: 297 }, landscape: false,
  marginPreset: "moderate", margins: { t: 25.4, r: 19.1, b: 25.4, l: 19.1 }, pageNumber: "center", pageNumberFormat: "total",
  runningHeader: "chapter", footerText: "{title}", breakMode: "whitespace", zoom: 1.5
});

describe("layout library", () => {
  it("snapshots only layout fields and copies nested values", () => {
    const source = page();
    const saved = snapshotLayout(source, "simsun");
    expect(saved).not.toHaveProperty("zoom");
    expect(saved.wordFont).toBe("simsun");
    source.margins.t = 1;
    expect(saved.margins.t).toBe(25.4);
  });
  it("lists what applying would change and nothing else", () => {
    const current = snapshotLayout(page(), "yahei");
    expect(layoutChanges(current, { ...current })).toEqual([]);
    expect(layoutChanges(current, { paged: false, wordFont: "simsun" })).toEqual([
      { label: "分页阅读", from: "开", to: "关" },
      { label: "Word 字体", from: "微软雅黑", to: "宋体" }
    ]);
  });
  it("applies a layout and recomputes margins from the paper", () => {
    const target = page();
    applyLayout(target, { paper: "A5", wordFont: "simsun" });
    expect(target.paper).toBe("A5");
    expect(target.margins.t).toBeCloseTo(19.8, 1);
    expect(target).not.toHaveProperty("wordFont");
    target.marginPreset = "custom";
    target.margins = { t: 5, r: 5, b: 5, l: 5 };
    applyLayout(target, { paper: "A4" });
    expect(target.margins.t).toBe(5);
  });
  it("round-trips through JSON and reports dropped fields", () => {
    const saved = snapshotLayout(page(), "yahei");
    const back = importLayouts(exportLayouts([{ id: "1", name: "周报", settings: saved }]));
    expect(back.error).toBeUndefined();
    expect(back.layouts[0].name).toBe("周报");
    expect(back.layouts[0].settings).toEqual(saved);
    const odd = importLayouts(JSON.stringify({ ibpLayoutVersion: 1, layouts: [{ name: "x", settings: { paged: true, width: "huge", color: "red", margins: { t: 1 } } }] }));
    expect(odd.layouts[0].settings).toEqual({ paged: true });
    expect(odd.dropped).toEqual(["x：color", "x：width", "x：margins"]);
  });
  it("refuses broken or newer files", () => {
    expect(importLayouts("not json").error).toBeTruthy();
    expect(importLayouts("{\"layouts\":[]}").error).toBeTruthy();
    expect(importLayouts("{\"ibpLayoutVersion\":9,\"layouts\":[]}").error).toContain("更新");
  });
  it("sanitizes ranges and picks unique names", () => {
    expect(sanitizeLayout({ customWidth: 500, footerText: "ok" }).settings).toEqual({ footerText: "ok" });
    expect(uniqueLayoutName("周报", ["周报", "周报 2"])).toBe("周报 3");
    expect(uniqueLayoutName("  ", [])).toBe("我的版式");
  });
});

import { cleanLayouts } from "./layout-library-core";
describe("stored layouts", () => {
  it("drops malformed records and fills missing ids", () => {
    expect(cleanLayouts("nope")).toEqual([]);
    const kept = cleanLayouts([{ name: "好", settings: { paged: true } }, { name: "", settings: { paged: true } }, { name: "空", settings: { bogus: 1 } }, 7]);
    expect(kept).toEqual([{ id: "layout-1", name: "好", settings: { paged: true } }]);
  });
});
