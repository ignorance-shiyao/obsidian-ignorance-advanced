import { describe, expect, it } from "vitest";
import { cellValue, resolveChartSource, splitChartSource, tableRows } from "./echarts-table-core";

const note = ["# 报告", "", "| 季度 | 营收 | 增长 |", "| --- | ---: | --- |", "| Q1 | 1,200 | 5% |", "| Q2 | 1500 | 8% |", "", "表：季度营收 {#tab-q}", "", "![图 {#fig-a}](a.png)"].join("\n");

describe("chart source directive", () => {
  it("splits the first line from the JSON", () => {
    expect(splitChartSource("source: {#tab-q}\n{\"a\":1}")).toEqual({ id: "tab-q", json: "{\"a\":1}" });
    expect(splitChartSource("{\"a\":1}").id).toBeNull();
    expect(splitChartSource("\n\n  source：{#x}\n{}").id).toBe("x");
  });
  it("reads numbers, percentages and text", () => {
    expect(cellValue("1,200")).toBe(1200);
    expect(cellValue("5%")).toBe(5);
    expect(cellValue("-3.5")).toBe(-3.5);
    expect(cellValue("Q1")).toBe("Q1");
    expect(cellValue("")).toBe("");
  });
  it("finds the table above its caption", () => {
    expect(tableRows(note, "tab-q")).toEqual([["季度", "营收", "增长"], ["Q1", 1200, 5], ["Q2", 1500, 8]]);
  });
  it("reports a missing or wrong caption clearly", () => {
    expect(() => tableRows(note, "nope")).toThrow("找不到");
    expect(() => tableRows(note, "fig-a")).toThrow("不是表格题注");
  });
  it("fills dataset.source but keeps an authored dataset", () => {
    const option = JSON.parse(resolveChartSource("source: {#tab-q}\n{\"series\":[{\"type\":\"bar\"}]}", note)) as { dataset: { source: unknown[] }; series: { type: string }[] };
    expect(option.dataset.source[1]).toEqual(["Q1", 1200, 5]);
    expect(option.series[0].type).toBe("bar");
    const own = JSON.parse(resolveChartSource("source: {#tab-q}\n{\"dataset\":{\"source\":[[1]]}}", note)) as { dataset: { source: unknown[] } };
    expect(own.dataset.source).toEqual([[1]]);
  });
  it("leaves blocks without a directive alone and rejects bad JSON", () => {
    expect(resolveChartSource("{\"a\":1}", note)).toBe("{\"a\":1}");
    expect(() => resolveChartSource("source: {#tab-q}\n{oops", note)).toThrow("有效 JSON");
  });
  it("handles escaped pipes", () => {
    const text = ["| a | b |", "| - | - |", "| x\\|y | 2 |", "", "表：t {#tab-t}"].join("\n");
    expect(tableRows(text, "tab-t")[1]).toEqual(["x|y", 2]);
  });
});
