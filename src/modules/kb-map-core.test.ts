import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { buildMapGraph, filterGraph, neighbourhood, searchNodes, topicDigest } from "./kb-map-core.js";

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

describe("neighbourhood", () => {
  const node = (id: string) => ({ id, name: id, kind: "topic" as const, area: "knowledge" as const, topic: id, path: null, size: 1 });
  const graph = {
    nodes: ["a", "b", "c", "d"].map(node),
    edges: [{ source: "a", target: "b", kind: "link" as const }, { source: "c", target: "b", kind: "link" as const }, { source: "c", target: "d", kind: "link" as const }]
  };
  it("keeps the node and its direct neighbours at depth 1, reading links both ways", () => {
    expect(neighbourhood(graph, "b", 1).nodes.map(n => n.id).sort()).toEqual(["a", "b", "c"]);
  });
  it("reaches further with a larger depth and keeps only edges inside", () => {
    const wide = neighbourhood(graph, "a", 3);
    expect(wide.nodes).toHaveLength(4);
    expect(wide.edges).toHaveLength(3);
    expect(neighbourhood(graph, "a", 1).edges).toHaveLength(1);
  });
  it("returns the whole graph for an unknown id", () => {
    expect(neighbourhood(graph, "zzz", 1)).toBe(graph);
  });
});
