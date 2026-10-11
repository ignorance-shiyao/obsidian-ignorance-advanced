import { describe, expect, it } from "vitest";
import { parseCaptions } from "./captions";

describe("题注解析", () => {
  it("图片 alt 作为图注，忽略尺寸与关键字，按出现顺序编号", () => {
    const source = ["![架构图 {#fig-arch}](a.png)", "", "![left|400](b.png)", "", "![系统流程](c.png)"].join("\n");
    const entries = parseCaptions(source);
    expect(entries.map(entry => [entry.line, entry.label, entry.id])).toEqual([[0, "图 1", "fig-arch"], [4, "图 2", undefined]]);
    expect(entries[0].text).toBe("架构图");
  });
  it("表格下一行的「表：」是表题注，没有表格时不算", () => {
    const source = ["| a | b |", "| - | - |", "| 1 | 2 |", "", "表：季度营收 {#tab-q}", "", "表：孤立的一行"].join("\n");
    const entries = parseCaptions(source);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "tab", label: "表 1", id: "tab-q", text: "季度营收" });
  });
  it("英文题注使用 Figure 与 Table", () => {
    const entries = parseCaptions("![System overview](a.png)\n\n| a |\n| - |\n\nTable: Results");
    expect(entries.map(entry => entry.label)).toEqual(["Figure 1", "Table 1"]);
  });
  it("代码块里的内容不参与", () => {
    expect(parseCaptions("```md\n![图](a.png)\n```\n")).toEqual([]);
  });

  it("画廊和图片对比容器里的图片不算图", () => {
    const source = ["::: compare", "![之前](a.png)", "![之后](b.png)", ":::", "", "![独立图片](c.png)"].join("\n");
    expect(parseCaptions(source).map(entry => [entry.line, entry.label])).toEqual([[5, "图 1"]]);
  });

  it("代码块和公式下方的题注", () => {
    const source = ["```python", "print(1)", "```", "代码：打印 {#code-print}", "", "$$", "E = mc^2", "$$", "公式：质能方程 {#eq-e}", "", "代码：孤立的一行"].join("\n");
    const entries = parseCaptions(source);
    expect(entries.map(entry => [entry.kind, entry.label, entry.id])).toEqual([["code", "代码 1", "code-print"], ["eq", "公式 1", "eq-e"]]);
  });
  it("单行 $$ 公式也能带题注", () => {
    expect(parseCaptions("$$a+b$$\n\nEquation: Sum").map(entry => entry.label)).toEqual(["Equation 1"]);
  });
});
