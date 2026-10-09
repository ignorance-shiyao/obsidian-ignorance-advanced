import { describe, expect, it } from "vitest";
import { colorValue, hexColorTags, inlineCodeSpans, isPlainTextColor } from "./color-swatch-core";

describe("色值圆点", () => {
  it("识别十六进制与函数写法的颜色", () => {
    for (const value of ["#4D81EF", "#fff", "#FFFFFF80", "rgb(12, 34, 56)", "rgba(0 0 0 / 50%)", "hsl(210 80% 60%)", "oklch(0.7 0.1 250)"]) {
      expect(colorValue(value)).toBe(value);
    }
    expect(colorValue(" #4D81EF ")).toBe("#4D81EF");
  });

  it("只认整段代码都是色值，其他内容不加圆点", () => {
    for (const text of ["color: #fff", "#4D81EG", "#12345", "rgb(1, 2", "const a = 1", "#tag"]) {
      expect(colorValue(text)).toBeNull();
    }
  });

  it("找出一行里的行内代码及其内容位置", () => {
    const line = "主色：`#4D81EF`，辅色 ``rgb(1, 2, 3)``，普通 #fff";
    expect(inlineCodeSpans(line).map(([, , text]) => text)).toEqual(["#4D81EF", "rgb(1, 2, 3)"]);
    const [from, to] = inlineCodeSpans(line)[0];
    expect(line.slice(from, to)).toBe("#4D81EF");
  });

  it("找出一行里本身就是十六进制颜色的标签", () => {
    const line = "| chart.6 | #C9561B | #E9865A | 标签 #project #abc123x 链接 a#fff";
    expect(hexColorTags(line).map(([, color]) => color)).toEqual(["#C9561B", "#E9865A"]);
    const [from] = hexColorTags(line)[0];
    expect(line.slice(from, from + 7)).toBe("#C9561B");
  });

  it("正文里的十六进制色值只认 6/8 位，避免把 #123 这类编号当颜色", () => {
    expect(isPlainTextColor("#182435")).toBe(true);
    expect(isPlainTextColor("#18243580")).toBe(true);
    expect(isPlainTextColor("#123")).toBe(false);
    expect(isPlainTextColor("#1234")).toBe(false);
  });
});
