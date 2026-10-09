import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseMarkdownContainers } from "./container-source";

describe("::: Markdown 容器解析", () => {
  it("读取容器类型、标题、行范围并支持嵌套", () => {
    const source = [
      "开头正文。",
      "",
      ":::cols", ":::col", "左列", ":::", ":::col", "右列", ":::", ":::",
      "",
      ":::details 展开说明", "内容", ":::",
      ""
    ].join("\n");
    const nodes = parseMarkdownContainers(source);
    expect(nodes.map(node => [node.kind, node.startLine, node.endLine])).toEqual([
      ["cols", 2, 9], ["details", 11, 13]
    ]);
    expect(nodes[0].children.map(node => node.kind)).toEqual(["col", "col"]);
    expect(nodes[1].title).toBe("展开说明");
    expect(source.slice(nodes[1].contentStart, nodes[1].contentEnd)).toBe("内容\n");
  });

  it("忽略 fenced code 中的开闭标记，并保持不完整容器为原文", () => {
    const source = [
      ":::card", "示例源码：", "```markdown", ":::tip", ":::", "```", "真实正文", ":::",
      ":::warning", "没有闭合", "",
      "~~~text", ":::info", "~~~"
    ].join("\n");
    const nodes = parseMarkdownContainers(source);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].kind).toBe("card");
    expect(nodes[0].children).toEqual([]);
    expect(source.slice(nodes[0].contentStart, nodes[0].contentEnd)).toContain("真实正文");
  });

  it("让未知嵌套类型参与闭合深度，但不吞掉后续已知容器", () => {
    const source = [
      ":::card", ":::unsupported", "普通文本", ":::", ":::",
      ":::tip", "后续提示", ":::",
    ].join("\n");
    const nodes = parseMarkdownContainers(source);
    expect(nodes.map(node => node.kind)).toEqual(["card", "tip"]);
    expect(nodes[0].children).toEqual([]);
  });

  it("完整识别混合版式回归样例中的各类容器", () => {
    const source = readFileSync(new URL("./fixtures/ppt-mixed-layouts.md", import.meta.url), "utf8");
    const roots = parseMarkdownContainers(source);
    const kinds = new Set<string>();
    const visit = nodes => nodes.forEach(node => { kinds.add(node.kind); visit(node.children); });
    visit(roots);
    expect(["kpi", "cols", "card", "panel", "process", "gallery", "roadmap", "matrix"].every(kind => kinds.has(kind))).toBe(true);
    expect(roots.every(node => node.endLine > node.startLine)).toBe(true);
  });
});
