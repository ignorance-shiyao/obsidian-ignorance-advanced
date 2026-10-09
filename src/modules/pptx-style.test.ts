import { describe, expect, it } from "vitest";
import { collapseWhitespace, cssColor, fontFace, fontPoints, groupAdjacentBlocks, hasCjk, isBold, textAlign } from "./pptx-style";

describe("PPTX 样式换算", () => {
  it("把 CSS 颜色转成十六进制与透明度，透明色返回 null", () => {
    expect(cssColor("rgb(12, 34, 56)")).toEqual({ hex: "0C2238", transparency: 0 });
    expect(cssColor("rgba(255, 255, 255, 0.5)")).toEqual({ hex: "FFFFFF", transparency: 50 });
    expect(cssColor("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssColor("transparent")).toBeNull();
  });

  it("取字体栈里第一个可用字体，通用族映射到 macOS 字体", () => {
    expect(fontFace('"Songti SC", STSong, serif')).toBe("Songti SC");
    expect(fontFace("'??', -apple-system, \"PingFang SC\"")).toBe("PingFang SC");
    expect(fontFace("ui-monospace, Menlo")).toBe("Menlo");
    expect(fontFace("")).toBe("PingFang SC");
    expect(fontFace('Inter, "PingFang SC", sans-serif', name => name !== "Inter")).toBe("PingFang SC");
    expect(fontFace("Inter, Nope", () => false)).toBe("PingFang SC");
  });

  it("按画布宽度把 CSS 像素换算成磅值", () => {
    // 1280px canvas on a 13.333in (960pt) slide → 0.75pt per px.
    expect(fontPoints(32, 1280, 13.333333)).toBe(24);
    expect(fontPoints(2, 1280, 13.333333)).toBe(6);
  });

  it("识别粗体、对齐与空白折叠", () => {
    expect(isBold("700")).toBe(true);
    expect(isBold("400")).toBe(false);
    expect(textAlign("start")).toBe("left");
    expect(textAlign("center")).toBe("center");
    expect(collapseWhitespace("a\n  b\tc")).toBe("a b c");
    expect(hasCjk("要点")).toBe(true);
    expect(hasCjk("FDE 2026")).toBe(false);
  });

  it("相邻、同父、同样式、左对齐且只隔段间距的文本块合并", () => {
    const parent = {};
    const block = (y, h, extra = {}) => ({ key: "p|16|333", parent, rect: { x: 1, y, w: 8, h }, lineHeight: 0.3, ...extra });
    expect(groupAdjacentBlocks([block(1, 0.3), block(1.45, 0.6), block(2.2, 0.3)])).toEqual([[0, 1, 2]]);
    // 样式不同、父元素不同、间距过大、缩进不同都断开。
    expect(groupAdjacentBlocks([block(1, 0.3), block(1.45, 0.3, { key: "h2|24|000" })])).toEqual([[0], [1]]);
    expect(groupAdjacentBlocks([block(1, 0.3), block(1.45, 0.3, { parent: {} })])).toEqual([[0], [1]]);
    expect(groupAdjacentBlocks([block(1, 0.3), block(2.5, 0.3)])).toEqual([[0], [1]]);
    expect(groupAdjacentBlocks([block(1, 0.3), block(1.45, 0.3, { rect: { x: 1.5, y: 1.45, w: 7.5, h: 0.3 } })])).toEqual([[0], [1]]);
  });
});
