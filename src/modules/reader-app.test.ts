import { describe, expect, it } from "vitest";
import { runInNewContext } from "node:vm";
import { readerAppScript } from "./reader-app";

// Execute the emitted reader initialization, not a second implementation.
function initialTheme(exported: string | undefined, saved: string | null | Record<string, string>, systemDark: boolean, preferenceId?: string) {
  const shell = { dataset: { theme: exported, preferenceId } };
  const script = readerAppScript();
  const initialization = script.slice(0, script.indexOf("    const toggleTheme=")) + "})()";
  runInNewContext(initialization, {
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
  it("保留阅读器自己的有效手动偏好", () => {
    expect(initialTheme("light", "dark", false)).toBe("dark");
    expect(initialTheme("dark", "light", true)).toBe("light");
  });
  it("无效保存值不覆盖导出明暗", () => {
    expect(initialTheme("light", "system", true)).toBe("light");
  });
  it("新导出忽略旧的全局偏好及其他文档的偏好", () => {
    expect(initialTheme("light", { "ib-reader-theme": "dark", "ib-reader-other-theme": "dark" }, true, "current")).toBe("light");
  });
  it("仅恢复当前导出范围内的手动选择", () => {
    expect(initialTheme("light", { "ib-reader-current-theme": "dark" }, false, "current")).toBe("dark");
    expect(initialTheme("light", { "ib-reader-current-theme": "invalid", "ib-reader-theme": "dark" }, true, "current")).toBe("light");
  });
  it.each([true, false])("旧文件无有效模式时跟随系统（系统深色 %s）", dark => {
    expect(initialTheme(undefined, null, dark)).toBe(dark ? "dark" : "light");
    expect(initialTheme("invalid", null, dark)).toBe(dark ? "dark" : "light");
  });
});
