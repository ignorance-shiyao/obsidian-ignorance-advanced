import { describe, expect, it } from "vitest";
import { formatNumberCell, percentValue, planMerges, rowLevels } from "./table-merge";

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

  it("长整数加千分位，年份和已有分隔符不动", () => {
    expect(formatNumberCell("1234567")).toBe("1,234,567");
    expect(formatNumberCell("-98765.4321")).toBe("-98,765.4321");
    expect(formatNumberCell("2026")).toBeNull();
    expect(formatNumberCell("1,234,567")).toBeNull();
    expect(formatNumberCell("abc")).toBeNull();
  });
  it("百分比限定在 0 到 100", () => {
    expect([percentValue("72%"), percentValue("100 %"), percentValue("12.5%"), percentValue("120%"), percentValue("x%")]).toEqual([72, 100, 12.5, null, null]);
  });
  it("首格的 > 表示子行层级", () => {
    expect(rowLevels(["华东", "> 上海", ">> 浦东", "> 江苏"])).toEqual([
      { level: 0, text: "华东" }, { level: 1, text: "上海" }, { level: 2, text: "浦东" }, { level: 1, text: "江苏" }
    ]);
  });
});
