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

  it("解析两段徽章、剧透、注音和面包屑", () => {
    const source = "((green:构建 | 通过)) ((版本 | 1.0)) ((spoiler:答案是 42)) ((ruby:汉字 | hànzì)) ((crumb:设置 > 外观 > 主题))";
    const tokens = parseInlineSyntax(source, null);
    expect(tokens.map(token => token.type)).toEqual(["badge", "badge", "spoiler", "ruby", "crumb"]);
    expect(tokens[0]).toMatchObject({ value: "构建", note: "通过", color: "green" });
    expect(tokens[1]).toMatchObject({ value: "版本", note: "1.0", color: undefined });
    expect(tokens[2].value).toBe("答案是 42");
    expect(tokens[3]).toMatchObject({ value: "汉字", note: "hànzì" });
    expect(tokens[4].parts).toEqual(["设置", "外观", "主题"]);
  });

  it("只有一段的面包屑和没有竖线的内容仍是普通药丸", () => {
    const tokens = parseInlineSyntax("((crumb:唯一)) ((green:通过))", null);
    expect(tokens.map(token => token.type)).toEqual(["pill", "pill"]);
  });

  it("解析交叉引用", () => {
    const tokens = parseInlineSyntax("见 ((ref:fig-arch)) 与 ((ref:tab-1))", null);
    expect(tokens.map(token => [token.type, token.value])).toEqual([["ref", "fig-arch"], ["ref", "tab-1"]]);
  });
});
