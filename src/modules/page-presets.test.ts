import { describe, expect, it } from "vitest";
import { PAGE_PRESETS, applyPagePreset, pageMatchesPreset } from "./page-presets";

describe("版式预设", () => {
  it("预设写入页面设置，页边距跟随纸张", () => {
    const page: Record<string, unknown> = { paper: "A4", margins: { t: 1, r: 1, b: 1, l: 1 } };
    expect(applyPagePreset(page, "paper")).toBe(true);
    expect(page).toMatchObject({ paged: true, landscape: false, pageNumberFormat: "total", runningHeader: "chapter", marginPreset: "moderate" });
    expect((page.margins as { t: number }).t).toBeGreaterThan(20);
  });
  it("博客预设回到连续阅读且不显示页码", () => {
    const page: Record<string, unknown> = { paged: true, pageNumber: "center", paper: "A4" };
    applyPagePreset(page, "blog");
    expect(page).toMatchObject({ paged: false, pageNumber: "none" });
  });
  it("未知预设不改动页面", () => {
    const page = { paged: true };
    expect(applyPagePreset(page, "none")).toBe(false);
    expect(page).toEqual({ paged: true });
  });
  it("预设编号唯一", () => {
    expect(new Set(PAGE_PRESETS.map(item => item.id)).size).toBe(PAGE_PRESETS.length);
  });
  it("刚套用的预设显示为选中，改一项后不再选中，且只有一个预设选中", () => {
    for (const preset of PAGE_PRESETS) {
      const page: Record<string, unknown> = { paper: "A4", margins: { t: 1, r: 1, b: 1, l: 1 } };
      applyPagePreset(page, preset.id);
      expect(PAGE_PRESETS.filter(item => pageMatchesPreset(page, item.id)).map(item => item.id)).toEqual([preset.id]);
      page.marginPreset = "custom";
      expect(pageMatchesPreset(page, preset.id)).toBe(false);
    }
  });
  it("没有字段的页面不匹配任何分页预设，未知预设不匹配", () => {
    expect(pageMatchesPreset({}, "paper")).toBe(false);
    expect(pageMatchesPreset({ paged: false }, "nope")).toBe(false);
  });
});
