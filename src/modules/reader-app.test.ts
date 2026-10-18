import { describe, expect, it } from "vitest";
import { Platform } from "obsidian";
import { readerAppScript } from "./reader-app";

// The reader script runs in a Node VM context; loaded on demand because Node built-ins are desktop-only.
const vm = Platform.isDesktop ? await import("node:vm") : null;

// Execute the emitted reader initialization, not a second implementation.
function initialTheme(exported: string | undefined, saved: string | null | Record<string, string>, systemDark: boolean, preferenceId?: string) {
  const shell = { dataset: { theme: exported, preferenceId } };
  const script = readerAppScript();
  const initialization = script.slice(0, script.indexOf("    const toggleTheme=")) + "})()";
  vm.runInNewContext(initialization, {
    document: { querySelector: () => shell },
    localStorage: { getItem: (key: string) => typeof saved === "object" && saved !== null ? saved[key] ?? null : saved },
    matchMedia: () => ({ matches: systemDark })
  });
  return shell.dataset.theme;
}

describe("离线阅读器明暗优先级", () => {
  it.each([true, false])("导出明暗不被系统主题覆盖（系统深色 %s）", dark => {
    expect(initialTheme("light", null, dark)).toBe("light");
    expect(initialTheme("dark", null, dark)).toBe("dark");
  });
  it("不读取浏览器里保存的偏好", () => {
    expect(initialTheme("light", "dark", false)).toBe("light");
    expect(initialTheme("dark", "light", true)).toBe("dark");
  });
  it("无效保存值不覆盖导出明暗", () => {
    expect(initialTheme("light", "system", true)).toBe("light");
  });
  it("新导出忽略旧的全局偏好及其他文档的偏好", () => {
    expect(initialTheme("light", { "ib-reader-theme": "dark", "ib-reader-other-theme": "dark" }, true, "current")).toBe("light");
  });
  it.each([true, false])("旧文件无有效模式时跟随系统（系统深色 %s）", dark => {
    expect(initialTheme(undefined, null, dark)).toBe(dark ? "dark" : "light");
    expect(initialTheme("invalid", null, dark)).toBe(dark ? "dark" : "light");
  });
});
