import { describe, expect, it } from "vitest";
import { buildNavItems } from "./navigation";

describe("导航列表", () => {
  const source = [
    "# 标题", "", "## 概述", "", "![架构 {#fig-a}](a.png)", "", "| a | b |", "| - | - |", "| 1 | 2 |", "", "表：营收", "",
    "```python", "print(1)", "```", "", "```mermaid", "graph TD", "```", "", "![[photo.jpg]]"
  ].join("\n");
  const headings = [{ text: "标题", level: 1, line: 0 }, { text: "概述", level: 2, line: 2 }];

  it("按行号收集标题、图、表、代码和图表", () => {
    const items = buildNavItems(source, headings);
    expect(items.map(item => [item.kind, item.line])).toEqual([
      ["heading", 0], ["heading", 2], ["figure", 4], ["table", 6], ["code", 12], ["diagram", 16], ["figure", 20]
    ]);
  });
  it("带题注的图和表使用题注作标签", () => {
    const items = buildNavItems(source, headings);
    expect(items.find(item => item.kind === "figure")?.label).toBe("图 1 架构");
  });
  it("表格下方的题注行成为该表格的名称，而不是另一项", () => {
    expect(buildNavItems(source, headings).find(item => item.kind === "table")?.label).toBe("表 1 营收");
  });
  it("没有内容时为空", () => {
    expect(buildNavItems("普通段落", [])).toEqual([]);
  });
});
