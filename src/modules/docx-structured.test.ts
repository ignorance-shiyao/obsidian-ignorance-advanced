import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createStructuredDocxBuffer, markdownForStructuredWord } from "./docx-structured";

const ONE_PIXEL_PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzV8AAAAASUVORK5CYII="), char => char.charCodeAt(0));

describe("结构化 Word 导出", () => {
  it("将设定字体和字号应用到一至三级标题，并保留标题段落关联", async () => {
    const output = await createStructuredDocxBuffer("# 一级\n\n## 二级\n\n### 三级\n\n正文", {
      style: { fontFamily: "Noto Sans CJK SC", fontSize: 12 }
    });
    const archive = await JSZip.loadAsync(output);
    const styles = await archive.file("word/styles.xml").async("string");
    const document = await archive.file("word/document.xml").async("string");
    for (const [level, size] of [[1, 38], [2, 32], [3, 28]]) {
      const heading = styles.match(new RegExp(`<w:style[^>]*w:styleId="Heading${level}"[\\s\\S]*?</w:style>`))?.[0];
      expect(heading).toContain('w:ascii="Noto Sans CJK SC"');
      expect(heading).toContain(`w:sz w:val="${size}"`);
      expect(heading).toContain("<w:b/>");
      expect(document).toContain(`w:pStyle w:val="Heading${level}"`);
      const paragraph = document.match(new RegExp(`<w:p>[\\s\\S]*?<w:pStyle w:val="Heading${level}"[\\s\\S]*?</w:p>`))?.[0];
      expect(paragraph).toContain(`w:sz w:val="${size}"`);
    }
  });

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
    const documentXml = await archive.file("word/document.xml").async("string");
    const relationships = await archive.file("word/_rels/document.xml.rels").async("string");
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

it("默认正文与三级标题使用微软雅黑，并保持独立的代码字体", async () => {
  const output = await createStructuredDocxBuffer("# 一级\n\n## 二级\n\n### 三级\n\n正文与 `code`", { style: { codeFamily: "Menlo" } });
  const archive = await JSZip.loadAsync(output);
  const styles = await archive.file("word/styles.xml").async("string");
  const document = await archive.file("word/document.xml").async("string");
  for (const level of [1, 2, 3]) {
    const heading = styles.match(new RegExp(`<w:style[^>]*w:styleId="Heading${level}"[\\s\\S]*?</w:style>`))?.[0];
    expect(heading).toContain('w:eastAsia="Microsoft YaHei"');
  }
  expect(document).toContain('w:ascii="Microsoft YaHei"');
  expect(document).toContain('w:eastAsia="Microsoft YaHei"');
  expect(document).toContain('w:ascii="Menlo"');
  expect(document).not.toContain("PingFang");
});
