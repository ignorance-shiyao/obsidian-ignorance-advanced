import { describe, expect, it } from "vitest";
import { classifyEmphasis, rubyBase, splitLiteralScratch, type Part } from "./prose-compat-core.js";

const t = (text: string): Part => ({ kind: "text", text });
const c = (text: string): Part => ({ kind: "code", text });

describe("classifyEmphasis", () => {
  it("single tag", () => expect(classifyEmphasis([c("待处理")])).toEqual({ type: "pill", value: "待处理" }));
  it("two-level tag", () => expect(classifyEmphasis([t("客户等级"), c("VIP")])).toEqual({ type: "badge", value: "客户等级", note: "VIP" }));
  it("three-level tag", () => expect(classifyEmphasis([t("版本"), c("2.0"), t("beta")])).toEqual({ type: "badge", value: "版本", note: "2.0 beta" }));
  it("scratch card", () => expect(classifyEmphasis([t("点击查看"), { kind: "strong", text: "42" }])).toEqual({ type: "spoiler", tip: "点击查看", value: "42" }));
  it("breadcrumb", () => expect(classifyEmphasis([{ kind: "mark", text: "文件 > 导出" }])).toEqual({ type: "crumb", parts: ["文件", "导出"] }));
  it("ruby", () => expect(classifyEmphasis([{ kind: "sup", text: "dào" }])).toEqual({ type: "ruby", note: "dào" }));
  it("ordinary emphasis stays", () => {
    expect(classifyEmphasis([t("普通斜体")])).toBeNull();
    expect(classifyEmphasis([{ kind: "mark", text: "只是高亮" }])).toBeNull();
    expect(classifyEmphasis([c("a"), t("x"), { kind: "other", text: "" }])).toBeNull();
  });
});

describe("rubyBase", () => {
  it("takes the last character or Latin word", () => {
    expect(rubyBase("道可道")).toBe("道");
    expect(rubyBase("say hello")).toBe("hello");
  });
});

describe("splitLiteralScratch", () => {
  it("reads Obsidian's rendering: literal star before, closing star inside the bold run", () => {
    expect(splitLiteralScratch("答案是 *点击查看", "42*", "。")).toEqual({ prefix: "答案是 ", tip: "点击查看", value: "42", suffix: "。" });
  });
  it("also takes the closing star after the bold run", () => {
    expect(splitLiteralScratch("*点击查看", "42", "*。")).toEqual({ prefix: "", tip: "点击查看", value: "42", suffix: "。" });
  });
  it("needs both stars", () => {
    expect(splitLiteralScratch("答案是 点击查看", "42*", "。")).toBeNull();
    expect(splitLiteralScratch("*点击查看", "42", "。")).toBeNull();
  });
});
