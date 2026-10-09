import { describe, expect, it } from "vitest";
import { parseInlineSyntax } from "./inline-syntax-source";

describe("行内 Markdown 方言解析", () => {
  it("解析状态药丸、限幅进度条、火花线和白名单图标", () => {
    const source = "状态 ((green:完成))；进度 ((bar:125:交付))；趋势 ((spark:3,5,2))；:bolt: :chart:";
    const tokens = parseInlineSyntax(source, new Set(["bolt", "chart-column-increasing"]));
    expect(tokens.map(token => token.type)).toEqual(["pill", "bar", "spark", "icon", "icon"]);
    expect(tokens[0].value).toBe("完成");
    expect(tokens[1].percent).toBe(100);
    expect(tokens[1].label).toBe("交付");
    expect(tokens[2].values).toEqual([3, 5, 2]);
    expect(tokens[3].icon).toBe("bolt");
    expect(tokens[4].icon).toBe("chart-column-increasing");
  });

  it("保留代码、链接、HTML 注释、网址和时间中的相似文本", () => {
    const source = [
      "`((green:代码)) :bolt:`",
      "```md",
      "((bar:80)) :bolt:",
      "```",
      "[链接 :bolt:](https://example.com/:bolt:)",
      "<!-- ((spark:1,2)) :bolt: -->",
      "网址 https://example.com/:bolt:，时间 12:30；正文 ((blue:正常))"
    ].join("\n");
    const tokens = parseInlineSyntax(source, new Set(["bolt"]));
    expect(tokens.map(token => token.value)).toEqual(["正常"]);
  });

  it("只识别已知图标，未知双括号内容仍作为中性药丸", () => {
    const tokens = parseInlineSyntax("((自定义标签)) :not-a-lucide: :circle-check:", new Set(["circle-check"]));
    expect(tokens.map(token => [token.kind, token.value])).toEqual([
      ["chip", "自定义标签"], ["icon", "circle-check"]
    ]);
  });
});
