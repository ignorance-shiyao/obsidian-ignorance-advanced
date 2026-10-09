import { describe, expect, it } from "vitest";
import { LINE_HEIGHT_PRESETS, applyLineHeightPreference, composeLineHeightTokens, resolveLineHeight } from "./line-height";

describe("行距预设", () => {
  it("提供交接规范要求的三个行距档位", () => {
    expect(LINE_HEIGHT_PRESETS.filter(preset => preset.value !== "theme").map(preset => preset.leading)).toEqual([1.55, 1.72, 1.95]);
    expect(composeLineHeightTokens("compact")).toEqual({ "--ib-text-leading": "1.55", "--line-height-normal": "var(--ib-text-leading)" });
    expect(composeLineHeightTokens("standard")["--ib-text-leading"]).toBe("1.72");
    expect(composeLineHeightTokens("spacious")["--ib-text-leading"]).toBe("1.95");
  });

  it("未设置时跟随主题，保留显式标准行距", () => {
    expect(resolveLineHeight(undefined).value).toBe("theme");
    expect(resolveLineHeight("unknown").leading).toBe(1.8);
    expect(resolveLineHeight("standard").leading).toBe(1.72);
  });

  it("回到主题默认时清除此前的固定行距", () => {
    const values = new Map<string, string>();
    const body = { style: { setProperty: (key: string, value: string) => values.set(key, value), removeProperty: (key: string) => values.delete(key) } } as unknown as HTMLElement;
    applyLineHeightPreference(body, "compact");
    expect(values.get("--ib-text-leading")).toBe("1.55");
    applyLineHeightPreference(body, "theme");
    expect(values.has("--ib-text-leading")).toBe(false);
    expect(values.get("--line-height-normal")).toBe("var(--ib-text-leading)");
  });
});
