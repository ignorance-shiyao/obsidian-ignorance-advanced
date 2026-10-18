import { expect, it } from "vitest";
import { wordFontFromToken, wordExportFonts, normalizeWordFont } from "./word-font";

it("跳过系统 CSS 别名以导出实际字体名", () => {
  expect(wordFontFromToken('-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif', "Arial")).toBe("PingFang SC");
});
it("保留用户指定的字体和等宽字体", () => {
  expect(wordFontFromToken('"Noto Sans CJK SC", sans-serif', "Arial")).toBe("Noto Sans CJK SC");
  expect(wordFontFromToken('Menlo, monospace', "Consolas")).toBe("Menlo");
});
it("字体链没有实际字体时使用回退字体", () => {
  expect(wordFontFromToken("system-ui, sans-serif", "Arial")).toBe("Arial");
  expect(wordFontFromToken("", "Arial")).toBe("Arial");
});

it("等宽字体链跳过 Office 无法解析的系统字体别名", () => {
  expect(wordFontFromToken('"SFMono-Regular", Menlo, Monaco, Consolas, monospace', "Consolas")).toBe("Menlo");
  expect(wordFontFromToken("SFMono-Regular, monospace", "Consolas")).toBe("Consolas");
  expect(wordFontFromToken('"JetBrains Mono", "SFMono-Regular", Menlo', "Consolas")).toBe("JetBrains Mono");
});

it("导出字体选项默认兼容旧设置，固定字体统一正文和标题", () => {
  const fonts = { text: "PingFang SC, sans-serif", heading: "Georgia, serif" };
  for (const value of [undefined, null, "invalid", "yahei"]) {
    expect(normalizeWordFont(value)).toBe("yahei");
    expect(wordExportFonts(value, fonts)).toEqual({ fontFamily: "Microsoft YaHei", headingFamily: "Microsoft YaHei" });
  }
  expect(wordExportFonts("simsun", fonts)).toEqual({ fontFamily: "SimSun", headingFamily: "SimSun" });
});
it("跟随主题统一正文与标题字体，避免繁简字形混用，空字体链安全回退", () => {
  expect(wordExportFonts("theme", { text: '"PingFang TC", -apple-system, "PingFang SC", sans-serif', heading: '"PingFang SC", sans-serif' }))
    .toEqual({ fontFamily: "PingFang TC", headingFamily: "PingFang TC" });
  expect(wordExportFonts("theme", { text: "system-ui", heading: "serif" }))
    .toEqual({ fontFamily: "Microsoft YaHei", headingFamily: "Microsoft YaHei" });
});
