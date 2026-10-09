import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createStructuredDocxBuffer, markdownForStructuredWord } from "./docx-structured";

const ONE_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzV8AAAAASUVORK5CYII=", "base64");

describe("结构化 Word 导出", () => {
  it("生成可解包的 docx，保留标题、行内样式、链接、列表、表格、代码和图片", async () => {
    const markdown = [
      "---",
      "title: 不应导出",
      "---",
      "# 中文标题 **加粗**",
      "",
      "正文包含 *斜体*、`行内代码` 和 [外链](https://example.com/)。",
      "",
      "> 引用段落",
      "",
      "- 无序项",
      "  - 嵌套项",
      "1. 有序项",
      "",
      "| 名称 | 结果 |",
      "| --- | --- |",
      "| 状态 | 完成 |",
      "| 图片 | ![示例图片](vault-test.png) |",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      ":::panel 容器标题",
      "((green:容器内容))",
      "((bar:75))",
      ":::"
    ].join("\n");

    const output = await createStructuredDocxBuffer(markdown, {
      title: "回退测试",
      resolveImage: async source => source === "vault-test.png" ? { type: "png", data: ONE_PIXEL_PNG } : null
    });
    expect(String.fromCharCode(...output.subarray(0, 2))).toBe("PK");

    const archive = await JSZip.loadAsync(output);
    const documentXml = await archive.file("word/document.xml")!.async("string");
    const relationships = await archive.file("word/_rels/document.xml.rels")!.async("string");
    expect(documentXml).toContain("中文标题");
    expect(documentXml).toContain("行内代码");
    expect(documentXml).toContain("有序项");
    expect(documentXml).toContain("嵌套项");
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("const answer = 42;");
    expect(documentXml).toContain("容器内容");
    expect(documentXml).toContain("75%");
    expect(documentXml).not.toContain("不应导出");
    expect(relationships).toContain("https://example.com/");
    expect(archive.file(/^word\/media\//).length).toBe(1);
  });

  it("移除 Obsidian 容器包装但保留代码块里的原文", () => {
    expect(markdownForStructuredWord([
      ":::panel 外层",
      "((green:正文状态))",
      "```md",
      ":::panel 代码示例",
      "((green:代码原文))",
      "```",
      ":::"
    ].join("\n"))).toBe([
      "正文状态",
      "```md",
      ":::panel 代码示例",
      "((green:代码原文))",
      "```"
    ].join("\n"));
  });
});
