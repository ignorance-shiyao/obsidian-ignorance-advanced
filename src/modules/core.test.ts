import { describe, expect, it } from "vitest";
import { derivePalette } from "./accent-palette";
import { paginateStrip, paginationElements } from "./pagination";
import { prepareMarkdownTextForPandoc } from "./pandoc-markdown";
import { extractTocHeadings, isTocDirective } from "./toc-headings";
import { PAGE_NUMBER_FORMATS } from "./page-numbers";

function luminance(hex: string) {
  const values = hex.match(/[\da-f]{2}/gi)!.map(pair => parseInt(pair, 16) / 255).map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
function contrast(first: string, second: string) {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

describe("主题色推导", () => {
  it("生成浅色和暗色按钮、正文对比度达标的令牌", () => {
    for (const color of ["#4D81EF", "#14B8A6", "#F59E0B", "#A855F7", "#111111", "#FFFFFF"]) {
      const palette = derivePalette(color);
      expect(contrast(palette["--ibc-light-solid"], palette["--ibc-light-on"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette["--ibc-light-text"], "#FAFBFD")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette["--ibc-dark-brand"], "#0F172A")).toBeGreaterThanOrEqual(3);
      expect(contrast(palette["--ibc-dark-text"], "#0F172A")).toBeGreaterThanOrEqual(6);
      expect(contrast(palette["--ibc-dark-solid"], palette["--ibc-dark-on"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("阅读分页窗口", () => {
  it("留白模式将完整块移到下一页", () => {
    const windows = paginateStrip([
      { top: 0, bottom: 60, atomic: false, breakpoints: [], leadIn: false },
      { top: 80, bottom: 140, atomic: false, breakpoints: [], leadIn: false }
    ], 100, "whitespace");
    expect(windows).toEqual([{ start: 0, stop: 80 }, { start: 80, stop: 140 }]);
  });

  it("截断模式只在给定文本行边界切块", () => {
    const windows = paginateStrip([
      { top: 0, bottom: 240, atomic: false, breakpoints: [70, 130, 190, 240], leadIn: false }
    ], 100, "cut");
    expect(windows).toEqual([
      { start: 0, stop: 70 },
      { start: 70, stop: 130 },
      { start: 130, stop: 190 },
      { start: 190, stop: 240 }
    ]);
  });

  it("不拆分图表，并把引导标题留给后续内容", () => {
    const atomic = paginateStrip([
      { top: 0, bottom: 40, atomic: false, breakpoints: [], leadIn: false },
      { top: 70, bottom: 170, atomic: true, breakpoints: [100, 150], leadIn: false }
    ], 100, "cut");
    expect(atomic[0]).toEqual({ start: 0, stop: 70 });
    const leadIn = paginateStrip([
      { top: 0, bottom: 70, atomic: false, breakpoints: [], leadIn: false },
      { top: 70, bottom: 80, atomic: false, breakpoints: [], leadIn: true },
      { top: 80, bottom: 180, atomic: false, breakpoints: [130, 170], leadIn: false }
    ], 100, "whitespace");
    expect(leadIn[0]).toEqual({ start: 0, stop: 70 });
    const stacked = paginateStrip([
      { top: 0, bottom: 60, atomic: false, breakpoints: [], leadIn: false },
      { top: 60, bottom: 72, atomic: false, breakpoints: [], leadIn: true },
      { top: 72, bottom: 82, atomic: false, breakpoints: [], leadIn: true },
      { top: 82, bottom: 180, atomic: false, breakpoints: [130, 170], leadIn: false }
    ], 100, "whitespace");
    expect(stacked[0]).toEqual({ start: 0, stop: 60 });
  });

  it.each(["cut", "whitespace"])("%s 模式中长图已在本页开始时不生成孤立标题页", mode => {
    const windows = paginateStrip([
      { top: 0, bottom: 684, atomic: false, breakpoints: [], leadIn: false },
      { top: 708, bottom: 732, atomic: false, breakpoints: [], leadIn: true },
      { top: 756, bottom: 783, atomic: false, breakpoints: [], leadIn: true },
      { top: 796, bottom: 1811, atomic: true, breakpoints: [814, 1600, 1811], leadIn: false }
    ], 850, mode);
    expect(windows).toEqual([
      { start: 0, stop: 814 },
      { start: 814, stop: 1600 },
      { start: 1600, stop: 1811 }
    ]);
  });

  it("续页重复表头时预留表头高度，并继续按行边界切分", () => {
    const windows = paginateStrip([
      { top: 0, bottom: 250, atomic: false, breakpoints: [40, 90, 140, 190, 240], leadIn: false, continuationOverhead: 20 }
    ], 100, "cut");
    expect(windows).toEqual([
      { start: 0, stop: 90 },
      { start: 90, stop: 140 },
      { start: 140, stop: 190 },
      { start: 190, stop: 250 }
    ]);
  });

  it("把 Markdown 预览容器展平成内部块，供正常分页计算", () => {
    const makeElement = (name: string, previewChildren: any[] | null = null) => ({
      name,
      children: previewChildren || [],
      matches: (selector: string) => previewChildren !== null && selector === ".ibm-markdown-preview-block",
      querySelector: (selector: string) => previewChildren !== null && selector === ":scope > .ibm-markdown-preview"
        ? { children: previewChildren }
        : null
    });
    const before = makeElement("before");
    const heading = makeElement("heading");
    const list = makeElement("list");
    const table = makeElement("table");
    const nestedPreview = makeElement("nested-preview", [heading]);
    const preview = makeElement("preview", [list, nestedPreview, table]);
    const after = makeElement("after");

    expect(paginationElements({ children: [before, preview, after] }).map(element => element.name))
      .toEqual(["before", "list", "heading", "table", "after"]);
    expect(paginationElements({ children: [makeElement("empty-preview", [])] }).map(element => element.name))
      .toEqual(["empty-preview"]);
  });
});

describe("Pandoc Markdown 改写", () => {
  it("转换 Mermaid、图片、wiki 链接、callout，并移除注释", async () => {
    const resolve = (target: string) => `/vault/assets/${target.split("/").at(-1)!.split("|")[0]}`;
    const source = [
      "```mermaid\nflowchart LR\nA-->B\n```",
      "![[photos/cover.webp|封面]]",
      "![相对图](./assets/local.png)",
      "![远程图](https://example.com/x.png)",
      "[[主题#预设|主题预设]] [[另一个#章节]]",
      "> [!WARNING] 小心",
      "%%内部注释%%正文"
    ].join("\n\n");
    const result = await prepareMarkdownTextForPandoc(source, ["C:\\tmp\\diagram.png"], resolve);
    expect(result).toContain("![](C:/tmp/diagram.png)");
    expect(result).toContain("![](<\/vault\/assets\/cover.webp>)");
    expect(result).toContain("![相对图](<\/vault\/assets\/local.png>)");
    expect(result).toContain("![远程图](https://example.com/x.png)");
    expect(result).toContain("主题预设 章节");
    expect(result).toContain("> **小心**");
    expect(result).toContain("正文");
    expect(result).not.toContain("内部注释");
  });
});

describe("目录与页码纯函数", () => {
  it("识别 Typora [toc] 与 Obsidian [[toc]] 两种独占行写法", () => {
    expect(isTocDirective("[toc]")).toBe(true);
    expect(isTocDirective("  [[TOC]]  ")).toBe(true);
    expect(isTocDirective("[[toc]] 后续文字")).toBe(false);
    expect(isTocDirective("[[别的笔记]]")).toBe(false);
  });

  it("投影 Obsidian 标题元数据", () => {
    expect(extractTocHeadings([
      { level: 2, heading: "第一节", position: { start: { line: 3 } } },
      { level: 3, heading: "子节", position: { start: { line: 8 } } }
    ])).toEqual([{ level: 2, text: "第一节", line: 3 }, { level: 3, text: "子节", line: 8 }]);
    expect(extractTocHeadings()).toEqual([]);
  });

  it("格式化四种页码样式", () => {
    expect(PAGE_NUMBER_FORMATS.plain(3)).toBe("3");
    expect(PAGE_NUMBER_FORMATS.total(3, 18)).toBe("3 / 18");
    expect(PAGE_NUMBER_FORMATS.gov(3)).toBe("- 3 -");
    expect(PAGE_NUMBER_FORMATS.zh(3)).toBe("第 3 页");
  });
});
