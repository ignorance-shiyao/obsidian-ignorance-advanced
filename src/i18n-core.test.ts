import { describe, expect, it } from "vitest";
import { fill, languageOfLocale, resolveLanguage, translateWith } from "./i18n-core";

const table = { "保存": "Save", "第 {n} 篇": "Note {n}" };

describe("translation", () => {
  it("uses English only for English, and falls back to the Chinese key", () => {
    expect(translateWith(table, "en", "保存")).toBe("Save");
    expect(translateWith(table, "zh", "保存")).toBe("保存");
    expect(translateWith(table, "en", "没有翻译")).toBe("没有翻译");
  });
  it("fills placeholders in either language and leaves unknown ones", () => {
    expect(translateWith(table, "en", "第 {n} 篇", { n: 3 })).toBe("Note 3");
    expect(translateWith(table, "zh", "第 {n} 篇", { n: 3 })).toBe("第 3 篇");
    expect(fill("{a}-{b}", { a: 1 })).toBe("1-{b}");
  });
  it("maps Obsidian locales and honours an explicit choice", () => {
    expect(languageOfLocale("zh-cn")).toBe("zh");
    expect(languageOfLocale("zh-tw")).toBe("zh");
    expect(languageOfLocale("en-gb")).toBe("en");
    expect(languageOfLocale("ja")).toBe("en");
    expect(resolveLanguage("auto", "zh-cn")).toBe("zh");
    expect(resolveLanguage("en", "zh-cn")).toBe("en");
    expect(resolveLanguage(undefined, "fr")).toBe("en");
  });
});
