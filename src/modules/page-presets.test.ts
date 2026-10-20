import { describe, expect, it } from "vitest";
import { BUILTIN_PREFIX, PAGE_PRESETS, builtinAliases, builtinLayouts } from "./page-presets";
import { applyLayout, findLayout, layoutMatches, snapshotLayout, type PageLike } from "./layout-library-core";

const blank = (): PageLike => ({ width: "standard", customWidth: 80, paged: false, paper: "A4", customPaper: { w: 210, h: 297 }, landscape: false, marginPreset: "normal", margins: { t: 1, r: 1, b: 1, l: 1 }, pageNumber: "center", pageNumberFormat: "plain", runningHeader: "none", footerText: "", breakMode: "whitespace" });

describe("内置版式", () => {
  it("编号唯一且带 builtin: 前缀，名字取冒号前", () => {
    const list = builtinLayouts();
    expect(new Set(list.map(item => item.id)).size).toBe(PAGE_PRESETS.length);
    expect(list.every(item => item.id.startsWith(BUILTIN_PREFIX))).toBe(true);
    expect(list.map(item => item.name)).toEqual(["论文", "汇报", "公文", "博客"]);
  });
  it("套用后页边距跟随纸张，且只有这一个版式显示为选中", () => {
    for (const record of builtinLayouts()) {
      const page = blank();
      applyLayout(page, record.settings);
      const now = snapshotLayout(page, "auto");
      expect(builtinLayouts().filter(item => layoutMatches(now, item.settings)).map(item => item.id)).toEqual([record.id]);
      page.marginPreset = "custom";
      expect(layoutMatches(snapshotLayout(page, "auto"), record.settings)).toBe(false);
    }
  });
  it("按名字、编号、中文别名查找，不区分大小写", () => {
    const list = builtinLayouts();
    expect(findLayout(list, "汇报", builtinAliases)?.id).toBe("builtin:report");
    expect(findLayout(list, "BUILTIN:PAPER")?.name).toBe("论文");
    expect(findLayout(list, "blog", builtinAliases)?.id).toBe("builtin:blog");
    expect(findLayout(list, "  ")).toBeUndefined();
    expect(findLayout(list, "不存在", builtinAliases)).toBeUndefined();
  });
});
