import { describe, expect, it } from "vitest";
import { findTabGroups, tabRoleAt } from "./tab-group-core.js";

const note = [
  "前文", "", "_^tab^_", "",
  "| 名称 | 值 |", "| --- | --- |", "| a | 1 |", "",
  "```js", "const a = 1;", "```", "",
  "![架构图](a.png)", "",
  "后文"
];

describe("findTabGroups", () => {
  it("collects the table, code block and picture after the marker", () => {
    const [group] = findTabGroups(note);
    expect(group.marker).toBe(2);
    expect(group.members.map(m => [m.kind, m.start, m.end, m.title])).toEqual([
      ["table", 4, 6, "名称"], ["code", 8, 10, "js"], ["image", 12, 12, "架构图"]
    ]);
  });
  it("stops at the first block that is not a table, picture or code", () => {
    const lines = ["_^tab^_", "", "![a](a.png)", "", "![b](b.png)", "", "普通段落", "", "![c](c.png)"];
    expect(findTabGroups(lines)[0].members.length).toBe(2);
  });
  it("needs at least two members", () => {
    expect(findTabGroups(["_^tab^_", "", "![a](a.png)", "", "文字"])).toEqual([]);
    expect(findTabGroups(["_^tab^_", "", "文字"])).toEqual([]);
  });
  it("ignores a marker that sits inside a code fence", () => {
    const lines = ["```md", "_^tab^_", "", "![a](a.png)", "", "![b](b.png)", "```"];
    expect(findTabGroups(lines)).toEqual([]);
  });
  it("reads wiki-style pictures by file name and keeps a table's title short", () => {
    const lines = ["_^tab^_", "", "![[img/pic.png|300]]", "", "|**表头**|x|", "|---|---|", "|1|2|", "|3|4|"];
    const [group] = findTabGroups(lines);
    expect(group.members.map(m => [m.kind, m.title])).toEqual([["image", "pic"], ["table", "表头"]]);
    expect(group.members[1].end).toBe(7);
  });
  it("finds several groups", () => {
    const lines = ["_^tab^_", "", "![a](a)", "", "![b](b)", "", "中", "", "_^tab^_", "", "```x", "1", "```", "", "```y", "2", "```"];
    expect(findTabGroups(lines).map(g => g.members.length)).toEqual([2, 2]);
  });
  it("does not run past an unclosed code fence", () => {
    expect(findTabGroups(["_^tab^_", "", "![a](a)", "", "```js", "x"])).toEqual([]);
  });
});

describe("tabRoleAt", () => {
  const groups = findTabGroups(note);
  it("names the bar, each tab and everything else", () => {
    expect(tabRoleAt(groups, 2)).toMatchObject({ role: "bar" });
    expect(tabRoleAt(groups, 4)).toMatchObject({ role: "member", index: 0 });
    expect(tabRoleAt(groups, 8)).toMatchObject({ role: "member", index: 1 });
    expect(tabRoleAt(groups, 12)).toMatchObject({ role: "member", index: 2 });
    expect(tabRoleAt(groups, 0)).toBeNull();
    expect(tabRoleAt(groups, 14)).toBeNull();
  });
});
