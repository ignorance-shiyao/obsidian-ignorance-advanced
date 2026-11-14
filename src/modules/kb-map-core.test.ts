import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { buildMapGraph, filterGraph, searchNodes, topicDigest } from "./kb-map-core.js";

const folders = normalizeKbSettings(undefined).folders;
const note = (path: string, links: string[] = []) => buildNote({ path, ctime: 0, mtime: 0, size: 1, links: Object.fromEntries(links.map(l => [l, 1])) }, folders);

describe("knowledge map", () => {
  const notes = [
    note("30-知识/AI/a.md", ["30-知识/AI/b.md", "30-知识/运维/c.md", "10-工作/5G/x.md"]),
    note("30-知识/AI/b.md"),
    note("30-知识/运维/c.md"),
    note("10-工作/5G/x.md"),
    note("20-个人/写作/y.md", ["30-知识/运维/c.md"]),
    note("20-个人/写作/z.md")
  ];
  const g = buildMapGraph(notes, folders);
  it("builds topics, notes and linked projects", () => {
    const kinds = Object.fromEntries(g.nodes.map(n => [n.id, n.kind]));
    expect(kinds).toEqual({ "30-知识/AI": "topic", "30-知识/运维": "topic", "30-知识/AI/a.md": "note", "30-知识/AI/b.md": "note", "30-知识/运维/c.md": "note", "10-工作/5G": "project", "20-个人/写作": "project" });
    expect(g.nodes.find(n => n.id === "30-知识/AI")?.size).toBe(2);
  });
  it("skips links inside a topic", () => {
    const links = g.edges.filter(e => e.kind === "link").map(e => [e.source, e.target]);
    expect(links).toEqual([["30-知识/AI/a.md", "30-知识/运维/c.md"], ["30-知识/AI/a.md", "10-工作/5G"], ["30-知识/运维/c.md", "20-个人/写作"]]);
    expect(g.edges.filter(e => e.kind === "member").length).toBe(3);
  });
  it("filters by area and searches", () => {
    const k = filterGraph(g, new Set(["knowledge"]));
    expect(k.nodes.some(n => n.kind === "project")).toBe(false);
    expect(k.edges.every(e => !e.target.startsWith("10-") && !e.target.startsWith("20-"))).toBe(true);
    expect(searchNodes(g, "运")).toEqual(["30-知识/运维"]);
    expect(searchNodes(g, " ")).toEqual([]);
  });
  it("extracts the topic digest", () => {
    expect(topicDigest("---\na: 1\n---\n# T\n\n第一段 [[x|别名]]。\n\n第二段")).toBe("第一段 别名。");
    expect(topicDigest("# T\n\n开头\n\n## 提炼\n**要点**一\n要点二\n## 其他\n")).toBe("要点一 要点二");
  });
});
