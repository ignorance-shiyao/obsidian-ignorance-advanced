import { describe, expect, it } from "vitest";
import { PAPERS, paperMarginScale, paperMarginsForPreset, paperSize } from "./paper";

describe("纸张规格与边距预设", () => {
  it("提供 A6 规格并正确处理横向纸张", () => {
    expect(PAPERS.A6).toMatchObject({ w: 105, h: 148 });
    expect(paperSize({ paper: "A6" })).toEqual({ w: 105, h: 148 });
    expect(paperSize({ paper: "A6", landscape: true })).toEqual({ w: 148, h: 105 });
  });

  it("只按计划缩放 A5 与 A6 的标准边距", () => {
    expect(paperMarginScale("A4")).toBe(1);
    expect(paperMarginScale("A5")).toBe(0.78);
    expect(paperMarginScale("A6")).toBe(0.55);
    expect(paperMarginsForPreset("normal", "A4")).toEqual({ t: 18, r: 16, b: 20, l: 16 });
    expect(paperMarginsForPreset("normal", "A5")).toEqual({ t: 14, r: 12.5, b: 15.6, l: 12.5 });
    expect(paperMarginsForPreset("normal", "A6")).toEqual({ t: 9.9, r: 8.8, b: 11, l: 8.8 });
    expect(paperMarginsForPreset("gov", "GOV")).toEqual({ t: 37, r: 26, b: 35, l: 28 });
  });

  it("自定义边距不会伪装成预设", () => {
    expect(paperMarginsForPreset("custom", "A6")).toBeNull();
  });
});
