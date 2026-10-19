import { describe, expect, it } from "vitest";
import { buildPack, fillTemplate, formatDate, readPack, safeFileName, stripTemplateLayout, templateLayoutName } from "./template-core";

const context = { title: "周报", author: "小明", now: new Date(2026, 9, 5, 8, 7, 3) };

describe("templates", () => {
  it("fills the fixed variables and formats dates", () => {
    expect(fillTemplate("# {{title}} · {{author}} · {{date}} {{time}}", context)).toBe("# 周报 · 小明 · 2026-10-05 08:07");
    expect(fillTemplate("{{ date:YYYY/MM/DD }} {{datetime}}", context)).toBe("2026/10/05 2026-10-05 08:07");
    expect(formatDate(context.now, "HH:mm:ss")).toBe("08:07:03");
  });
  it("leaves Templater syntax and unknown names untouched", () => {
    const text = "<% tp.date.now() %> {{unknown}} {{title}}";
    expect(fillTemplate(text, context)).toBe("<% tp.date.now() %> {{unknown}} 周报");
  });
  it("makes safe file names", () => {
    expect(safeFileName('a/b:c*?"d')).toBe("a b c d");
    expect(safeFileName("  ")).toBe("未命名");
    expect(safeFileName("..隐藏")).toBe("隐藏");
  });
  it("reads and strips the layout a template names", () => {
    const text = "---\ntags: a\nib-layout: 周报\n---\n正文";
    expect(templateLayoutName(text)).toBe("周报");
    expect(templateLayoutName("没有属性")).toBeNull();
    expect(stripTemplateLayout(text)).toBe("---\ntags: a\n---\n正文");
  });
});

describe("template packs", () => {
  it("round-trips and renames instead of overwriting", () => {
    const pack = buildPack([{ name: "周报", content: "a" }, { name: "方案", content: "b" }], [{ name: "版式" }]);
    const read = readPack(pack, ["周报"]);
    expect(read.add.map(item => item.name)).toEqual(["周报 2", "方案"]);
    expect(read.renamed).toEqual(["周报 → 周报 2"]);
    expect(read.layouts).toHaveLength(1);
  });
  it("refuses broken or newer packs", () => {
    expect(readPack("nope", []).error).toBeTruthy();
    expect(readPack(JSON.stringify({ templates: [] }), []).error).toBeTruthy();
    expect(readPack(JSON.stringify({ ibpTemplateVersion: 9, templates: [] }), []).error).toBeTruthy();
  });
});
