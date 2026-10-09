import { describe, expect, it } from "vitest";
import { widenPreviewWindow } from "./preview-overscan";

describe("原生预览滚动预渲染窗口", () => {
  it("扩大有限预渲染范围并在卸载时恢复", () => {
    const renderer = { renderExtra: 1, renderExtraMinPx: 500 };
    const restore = widenPreviewWindow(renderer);
    expect(renderer).toEqual({ renderExtra: 2, renderExtraMinPx: 1200 });
    restore();
    expect(renderer).toEqual({ renderExtra: 1, renderExtraMinPx: 500 });
  });
  it("保留更大的既有范围以及后续外部修改", () => {
    const renderer = { renderExtra: 4, renderExtraMinPx: 1800 };
    const restore = widenPreviewWindow(renderer);
    expect(renderer.renderExtra).toBe(4);
    renderer.renderExtra = 5;
    restore();
    expect(renderer).toEqual({ renderExtra: 5, renderExtraMinPx: 1800 });
  });
  it("不修改字段不兼容的宿主版本", () => {
    const renderer = { renderExtra: undefined, renderExtraMinPx: 500 };
    expect(widenPreviewWindow(renderer)).toBeNull();
    expect(renderer.renderExtraMinPx).toBe(500);
  });
});
