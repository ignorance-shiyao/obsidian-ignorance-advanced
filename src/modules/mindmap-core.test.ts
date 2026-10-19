import { describe, expect, it } from "vitest";
import { headingsToMindmap } from "./mindmap-core";

describe("headings to mindmap", () => {
  it("nests headings under the nearest shallower one", () => {
    const text = ["# 总", "## A", "### A1", "## B", "#### 深"].join("\n");
    expect(headingsToMindmap(text, "笔记")).toBe(['mindmap', '  root["笔记"]', '    n1["总"]', '      n2["A"]', '        n3["A1"]', '      n4["B"]', '        n5["深"]'].join("\n"));
  });
  it("skips fenced pseudo-headings and front matter, cleans markup", () => {
    const text = ["---", "# yaml", "---", "## **粗** [[页面|别名]]", "```", "## 伪", "```", '## 带"引号"'].join("\n");
    const result = headingsToMindmap(text, "t") ?? "";
    expect(result).toContain('n1["粗 别名"]');
    expect(result).toContain("n2[\"带'引号'\"]");
    expect(result).not.toContain("伪");
    expect(result).not.toContain("yaml");
  });
  it("returns null when there are no headings", () => {
    expect(headingsToMindmap("只有正文", "t")).toBeNull();
  });
});
