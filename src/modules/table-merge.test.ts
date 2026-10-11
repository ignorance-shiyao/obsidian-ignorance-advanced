import { describe, expect, it } from "vitest";
import { planMerges } from "./table-merge";

describe("表格合并计划", () => {
  it("< 并入左侧，^ 并入上方", () => {
    const { merges, removed } = planMerges([["A", "<", "C"], ["^", "E", "F"]]);
    expect(merges).toEqual([{ row: 0, col: 0, colspan: 2, rowspan: 2 }]);
    expect([...removed].sort()).toEqual(["0,1", "1,0"]);
  });
  it("2×2 合并块", () => {
    const { merges } = planMerges([["A", "<", "x"], ["^", "<", "y"]]);
    expect(merges).toEqual([{ row: 0, col: 0, colspan: 2, rowspan: 2 }]);
  });
  it("第一列的 < 与第一行的 ^ 不处理", () => {
    const { merges, removed } = planMerges([["<", "B"], ["C", "D"]]);
    expect(merges).toEqual([]);
    expect(removed.size).toBe(0);
    expect(planMerges([["^", "B"]]).merges).toEqual([]);
  });
  it("连续的 < 合成更宽的单元格", () => {
    expect(planMerges([["A", "<", "<", "D"]]).merges).toEqual([{ row: 0, col: 0, colspan: 3, rowspan: 1 }]);
  });
});
