import { describe, expect, it } from "vitest";
import { shouldHideMoreMenuItem } from "./more-menu";

describe("more-options menu filter", () => {
  it("hides items the title-row toolbar already offers", () => {
    expect(shouldHideMoreMenuItem("lucide-book-open", "pane")).toBe(true);
    expect(shouldHideMoreMenuItem("lucide-separator-vertical", "open")).toBe(true);
    expect(shouldHideMoreMenuItem("lucide-file-down", "action")).toBe(true);
  });

  it("hides items unrelated to the note", () => {
    expect(shouldHideMoreMenuItem("lucide-file-json", undefined)).toBe(true);
    expect(shouldHideMoreMenuItem("excalidraw-icon", "action-primary")).toBe(true);
  });

  it("keeps file actions that share an icon with a hidden item", () => {
    expect(shouldHideMoreMenuItem("lucide-edit-3", "action")).toBe(false); // 重命名
    expect(shouldHideMoreMenuItem("lucide-code-2", "pane")).toBe(false);   // 源码模式
    expect(shouldHideMoreMenuItem("lucide-trash-2", "danger")).toBe(false);
  });
});
