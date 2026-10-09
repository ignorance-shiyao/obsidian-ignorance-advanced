import { describe, expect, it } from "vitest";
import { wrapSelectionChange } from "./wrap-selection-core";

describe("选区高亮包裹", () => {
  it("输入 = 时用 == 包裹选区，并把选区保留在标记内部", () => {
    expect(wrapSelectionChange("A选中文字B", 1, 5, "=")?.text).toBe("A==选中文字==B");
    expect(wrapSelectionChange("A选中文字B", 1, 5, "=")?.selection).toEqual({ from: 3, to: 7 });
  });

  it("* _ ` 交给 Obsidian 自动配对，空选区不拦截输入", () => {
    for (const marker of ["*", "_", "`", "+"]) expect(wrapSelectionChange("text", 0, 4, marker)).toBeNull();
    expect(wrapSelectionChange("text", 2, 2, "=")).toBeNull();
  });
});
