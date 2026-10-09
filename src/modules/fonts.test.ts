import { describe, expect, it } from "vitest";
import { HEADING_FONTS, composeFontTokens, applyFontPreferences, migrateLegacyFonts } from "./fonts";

describe("标题字体", () => {
  it("默认及未知选项保留主题字体，显式跟随正文仍有效", () => {
    expect(composeFontTokens({})).toEqual({});
    expect(composeFontTokens({ fontHeading: "missing" })).toEqual({});
    expect(composeFontTokens({ fontHeading: "match-text" })["--ib-font-heading"]).toBe("var(--font-text)");
  });

  it("从自定义字体切回主题时移除旧覆盖", () => {
    const values = new Map();
    const body = { style: { setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name) } };
    applyFontPreferences(body, { fontHeading: "system-sans" });
    expect(values.size).toBe(8);
    applyFontPreferences(body, { fontHeading: "theme" });
    expect(values.size).toBe(0);
  });

  it("所有标题级别与内联标题使用标题字体", () => {
    const tokens = composeFontTokens({ fontHeading: "rice-serif" });
    expect(tokens["--ib-font-heading"]).toBe(HEADING_FONTS[2].stack);
    expect(tokens["--inline-title-font"]).toBe("var(--ib-font-heading)");
    for (let level = 1; level <= 6; level += 1) expect(tokens[`--h${level}-font`]).toBe("var(--ib-font-heading)");
  });

  it("不再覆盖 Obsidian 的正文、界面与等宽字体", () => {
    const tokens = composeFontTokens({ fontHeading: "system-sans" });
    for (const name of ["--font-text", "--font-text-theme", "--font-monospace", "--font-interface"]) expect(tokens).not.toHaveProperty(name);
  });
});

describe("旧字体设置迁移", () => {
  const fakeApp = (config = {}) => ({
    config,
    vault: { getConfig: key => config[key] || "", setConfig: (key, value) => { config[key] = value; } },
    workspace: { trigger: () => {} }
  });

  it("把非默认的正文/等宽预设写入 Obsidian 设置一次", () => {
    const app = fakeApp();
    const appearance = { fontText: "rice-serif", fontMono: "modern-mono", fontHeading: "match-text" };
    expect(migrateLegacyFonts(app, appearance)).toBe(true);
    expect(app.config.textFontFamily).toContain("Songti SC");
    expect(app.config.monospaceFontFamily).toContain("Cascadia Code");
    expect(appearance).toEqual({ fontHeading: "match-text" });
  });

  it("默认预设或已有 Obsidian 字体设置时不改动", () => {
    const app = fakeApp({ textFontFamily: "LXGW WenKai" });
    const appearance = { fontText: "rice-serif", fontMono: "system-mono" };
    migrateLegacyFonts(app, appearance);
    expect(app.config.textFontFamily).toBe("LXGW WenKai");
    expect(app.config.monospaceFontFamily).toBeUndefined();
    expect(migrateLegacyFonts(app, appearance)).toBe(false);
  });
});
