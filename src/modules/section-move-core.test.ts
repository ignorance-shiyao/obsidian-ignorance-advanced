import { describe, expect, it } from "vitest";
import { moveSection, sectionAt } from "./section-move-core";

const note = ["# 标题", "", "## A", "a1", "### A1", "a11", "", "## B", "b1", "```", "## 不是标题", "```", "", "## C", "c1"].join("\n");

describe("section move", () => {
  it("includes sub-sections and ignores fenced pseudo-headings", () => {
    expect(sectionAt(note.split("\n"), 3)).toEqual({ start: 2, end: 7, level: 2 });
    expect(sectionAt(note.split("\n"), 10)).toEqual({ start: 7, end: 13, level: 2 });
  });
  it("moves a section down with its children", () => {
    const moved = moveSection(note, 2, "down");
    expect(moved?.text.split("\n").slice(2, 9)).toEqual(["## B", "b1", "```", "## 不是标题", "```", "", "## A"]);
    expect(moved?.text.split("\n").length).toBe(note.split("\n").length);
  });
  it("moves a section up", () => {
    const moved = moveSection(note, 13, "up");
    expect(moved?.text.split("\n").slice(7, 10)).toEqual(["## C", "c1", "## B"]);
  });
  it("has nothing to swap at the edges and for a lone child", () => {
    expect(moveSection(note, 2, "up")).toBeNull();
    expect(moveSection(note, 13, "down")).toBeNull();
    expect(moveSection(note, 4, "down")).toBeNull();
    expect(moveSection("没有标题", 0, "down")).toBeNull();
  });
  it("does not treat front matter lines as headings", () => {
    const text = ["---", "tags: x", "---", "# 一", "x", "# 二", "y"].join("\n");
    expect(moveSection(text, 3, "down")?.text).toBe(["---", "tags: x", "---", "# 二", "y", "# 一", "x"].join("\n"));
  });
  it("keeps every line", () => {
    const moved = moveSection(note, 7, "up");
    expect([...(moved?.text.split("\n") ?? [])].sort()).toEqual([...note.split("\n")].sort());
  });
});
