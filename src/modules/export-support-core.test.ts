import { describe, expect, it } from "vitest";
import { FORMAT_ORDER, LEVEL_LABELS, SUPPORT_ROWS, limitsFor } from "./export-support-core";

describe("export support table", () => {
  it("covers every format in every row, with a note wherever the level is not full", () => {
    for (const row of SUPPORT_ROWS) {
      for (const format of FORMAT_ORDER) {
        const cell = row.cells[format];
        expect(cell, `${row.block} / ${format}`).toBeDefined();
        expect(LEVEL_LABELS[cell.level]).toBeTruthy();
        if (cell.level === "none" || cell.level === "partial") expect(cell.note, `${row.block} / ${format}`).toBeTruthy();
      }
    }
  });
  it("lists the limits of one format", () => {
    expect(limitsFor("word").map(item => item.block)).toContain("ECharts 图表");
    expect(limitsFor("html").map(item => item.block)).not.toContain("表格");
  });
});
