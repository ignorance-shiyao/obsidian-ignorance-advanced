import { expect, it } from "vitest";
import { wordFontFromToken } from "./word-font";

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
