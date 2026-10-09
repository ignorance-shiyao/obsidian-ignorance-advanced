import { describe, expect, it } from "vitest";
import { readableDiagramScale } from "./diagram-readable-scale";

describe("大图默认阅读字号", () => {
  it("宽图与高图的适配比例均不能使最小文字低于 10px", () => {
    for (const fit of [0.19, 0.37, 0.05]) {
      const scale = readableDiagramScale(fit, 16);
      expect(scale * 16).toBeGreaterThanOrEqual(10);
    }
  });
  it("嵌套变换后的较小文字可要求超过原有缩放上限", () => {
    expect(readableDiagramScale(0.2, 2)).toBe(5);
  });
  it("已经可读的图不额外放大，未知字号不能伪装成达标", () => {
    expect(readableDiagramScale(0.8, 16)).toBe(0.8);
    expect(readableDiagramScale(0.2, null)).toBe(0.2);
  });
});
