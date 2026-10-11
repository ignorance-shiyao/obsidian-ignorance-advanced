import { describe, expect, it } from "vitest";
import { FOLD_ABOVE, codeLineCount } from "./code-fold";

describe("代码块折叠", () => {
  it("按行数统计，末尾换行不算一行", () => {
    expect(codeLineCount("a\nb\nc\n")).toBe(3);
    expect(codeLineCount("单行")).toBe(1);
    expect(codeLineCount("")).toBe(1);
  });
  it("折叠阈值是 40 行", () => {
    expect(FOLD_ABOVE).toBe(40);
  });
});
