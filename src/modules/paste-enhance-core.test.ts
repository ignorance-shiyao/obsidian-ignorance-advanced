import { describe, expect, it } from "vitest";
import { insideFence, linkPasteMarkdown, tablePasteMarkdown } from "./paste-enhance-core";

describe("paste enhancement", () => {
  it("makes a link from a URL pasted over selected text", () => {
    expect(linkPasteMarkdown("官网", " https://example.com/a?b=1 ")).toBe("[官网](https://example.com/a?b=1)");
  });
  it("leaves other pastes alone", () => {
    expect(linkPasteMarkdown("", "https://example.com")).toBeNull();
    expect(linkPasteMarkdown("文字", "not a url")).toBeNull();
    expect(linkPasteMarkdown("文字", "https://a.com 和更多")).toBeNull();
    expect(linkPasteMarkdown("https://old.com", "https://new.com")).toBeNull();
    expect(linkPasteMarkdown("两\n行", "https://a.com")).toBeNull();
    expect(linkPasteMarkdown("[已是链接]", "https://a.com")).toBeNull();
  });
  it("turns tab-separated cells into a Markdown table", () => {
    expect(tablePasteMarkdown("名称\t数量\r\n苹果\t3\r\n梨|子\t5\r\n")).toBe("| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 3 |\n| 梨\\|子 | 5 |\n");
  });
  it("ignores text that is not a grid", () => {
    expect(tablePasteMarkdown("一行\t两格")).toBeNull();
    expect(tablePasteMarkdown("普通\n多行文字")).toBeNull();
    expect(tablePasteMarkdown("a\tb\nc")).toBeNull();
  });
  it("detects fenced code", () => {
    const text = "x\n```js\ncode\n```\ny";
    expect(insideFence(text, text.indexOf("code"))).toBe(true);
    expect(insideFence(text, text.indexOf("y"))).toBe(false);
  });
});
