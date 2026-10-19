import { describe, expect, it } from "vitest";
import { reorderTableLines, rowsToCsv, rowsToTsv, sortedOrder } from "./table-sort-core";

describe("table sorting", () => {
  it("sorts numbers with signs, thousands separators and percents", () => {
    expect(sortedOrder(["1,200", "-5", "30", "7.5%"], "asc")).toEqual([1, 3, 2, 0]);
    expect(sortedOrder(["1,200", "-5", "30", "7.5%"], "desc")).toEqual([0, 2, 3, 1]);
  });
  it("keeps empty cells last in both directions and ties stable", () => {
    expect(sortedOrder(["2", "", "1", "2"], "asc")).toEqual([2, 0, 3, 1]);
    expect(sortedOrder(["2", "", "1", "2"], "desc")).toEqual([0, 3, 2, 1]);
  });
  it("sorts dates by time, not text", () => {
    expect(sortedOrder(["2026-10-9", "2026-9-30", "2025/12/31"], "asc")).toEqual([2, 1, 0]);
  });
  it("sorts Chinese text and numbered names naturally", () => {
    expect(sortedOrder(["第10章", "第2章", "第1章"], "asc")).toEqual([2, 1, 0]);
    expect(sortedOrder(["b", "a", "C"], "asc")).toEqual([1, 0, 2]);
  });
  it("falls back to text when a column mixes numbers and words", () => {
    expect(sortedOrder(["10", "九", "2"], "asc")).toHaveLength(3);
  });
});

describe("table copy and write-back", () => {
  it("builds TSV and CSV", () => {
    const rows = [["名称", "说明"], ["a,b", 'say "hi"\nok']];
    expect(rowsToTsv(rows)).toBe("名称\t说明\na,b\tsay \"hi\" ok");
    expect(rowsToCsv(rows)).toBe('﻿名称,说明\r\n"a,b","say ""hi"" ok"');
  });
  it("reorders only a plain pipe table", () => {
    const lines = ["| a | b |", "| --- | --- |", "| 1 | x |", "| 2 | y |"];
    expect(reorderTableLines(lines, [1, 0])).toEqual(["| a | b |", "| --- | --- |", "| 2 | y |", "| 1 | x |"]);
    expect(reorderTableLines(lines, [0])).toBeNull();
    expect(reorderTableLines([...lines.slice(0, 3), "oops"], [0, 1])).toBeNull();
    expect(reorderTableLines(lines, [0, 0])).toBeNull();
  });
});
