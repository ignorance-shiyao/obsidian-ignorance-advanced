import { describe, expect, it } from "vitest";
import { scanExportIssues } from "./export-check-core";

const have = new Set(["a.png", "assets/b.jpg"]);
const options = (kind = "pdf") => ({ kind, exists: (target: string) => have.has(target) });

describe("export check", () => {
  it("reports nothing for a clean note", () => {
    const note = "# 标题\n\n![[a.png]]\n\n![图](assets/b.jpg)\n\n[[别的笔记]] 和 ![[别的笔记]]\n";
    expect(scanExportIssues(note, options())).toEqual([]);
  });
  it("finds missing images with their lines", () => {
    const note = "x\n![[gone.png]]\n\n![](assets/lost.png \"标题\")\n![](<assets/b.jpg>)";
    const issues = scanExportIssues(note, options());
    expect(issues.map(issue => [issue.line, issue.level])).toEqual([[2, "warn"], [4, "warn"]]);
    expect(issues[1].message).toContain("assets/lost.png");
  });
  it("counts remote images and leaves absolute paths alone", () => {
    const note = "![](https://a.com/1.png)\n![](https://a.com/2.png)\n![](/Users/x/y.png)";
    const issues = scanExportIssues(note, options());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ line: 1, level: "note" });
    expect(issues[0].message).toContain("2 张");
  });
  it("flags dynamic blocks and broken references, not code samples", () => {
    const note = "```dataview\nLIST\n```\n\n![图 {#fig-a}](a.png)\n\n见 ((ref:fig-a)) 与 ((ref:nope))\n\n`((ref:inline))`\n\n```md\n((ref:fenced))\n![](missing.png)\n```";
    const issues = scanExportIssues(note, options());
    expect(issues.map(issue => issue.line)).toEqual([1, 7]);
    expect(issues[1].message).toContain("nope");
  });
  it("adds Word-only notes", () => {
    const word = scanExportIssues("```mermaid\nflowchart\n```\n```base\n```", { ...options("word"), wordFont: "微软雅黑" });
    expect(word.map(issue => issue.message).join("|")).toMatch(/Mermaid.*base.*微软雅黑|Mermaid/);
    expect(word.some(issue => issue.message.includes("微软雅黑"))).toBe(true);
    expect(scanExportIssues("x", options("word"))).toEqual([]);
  });
});
