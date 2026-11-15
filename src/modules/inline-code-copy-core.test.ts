import { describe, expect, it } from "vitest";
import { COPY_MAX_LENGTH, copyableText } from "./inline-code-copy-core.js";

describe("copyableText", () => {
  it("returns the code text as written", () => {
    expect(copyableText("npm run build", "")).toBe("npm run build");
    expect(copyableText("  keep spaces ", "")).toBe("  keep spaces ");
  });
  it("copies nothing while the reader is selecting text", () => {
    expect(copyableText("abc", "ab")).toBeNull();
  });
  it("skips blank and oversize code", () => {
    expect(copyableText("   ", "")).toBeNull();
    expect(copyableText("", "")).toBeNull();
    expect(copyableText(null, "")).toBeNull();
    expect(copyableText("x".repeat(COPY_MAX_LENGTH + 1), "")).toBeNull();
  });
  it("treats a whitespace-only selection as no selection", () => {
    expect(copyableText("abc", "  ")).toBe("abc");
  });
});
