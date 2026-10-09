import { describe, expect, it } from "vitest";
import { diagramFit, HALF_A4_HEIGHT, DIAGRAM_HEADER_HEIGHT } from "./diagram-fit";

describe("图表完整展示与半页 A4 布局", () => {
  it("普通图同时满足宽度与总高度上限", () => {
    const fit = diagramFit(900, 750, 720, 1000);
    expect(fit.long).toBe(false);
    expect(900 * fit.scale).toBeLessThanOrEqual(720);
    expect(750 * fit.scale + 16 + DIAGRAM_HEADER_HEIGHT).toBeLessThanOrEqual(HALF_A4_HEIGHT);
  });
  it("超长竖图按宽度完整展示，不强制压缩进半页", () => {
    const fit = diagramFit(400, 2400, 720, 1000);
    expect(fit.long).toBe(true);
    expect(fit.scale).toBe(1);
    expect(fit.canvasLimit).toBe(2416);
  });
  it("多层竖向 C4 不因未达到旧的 2.5 比例而压入半页", () => {
    const fit = diagramFit(1348, 2580, 1096, 1000);
    expect(fit.long).toBe(true);
    expect(fit.scale).toBeCloseTo(1096 / 1348);
    expect(2580 * fit.scale + 16).toBeCloseTo(fit.canvasLimit);
  });
  it("小图保持原始尺寸，窄屏仍完整容纳宽图", () => {
    expect(diagramFit(240, 160, 720, 1000).scale).toBe(1);
    const fit = diagramFit(1800, 240, 320, 600);
    expect(1800 * fit.scale).toBeLessThanOrEqual(320);
  });
});
