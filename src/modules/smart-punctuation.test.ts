import { describe, expect, it } from "vitest";
import { isInsideCode, smartPunctuationChange } from "./smart-punctuation-core";

describe("智能标点纯函数", () => {
  it("默认关闭；启用后把连续短横线与句点转换成排版符号", () => {
    expect(smartPunctuationChange("正文-", 3, "-", false)).toBeNull();
    expect(smartPunctuationChange("正文-", 3, "-", true)).toEqual({ from: 2, to: 3, insert: "—", cursor: 3 });
    expect(smartPunctuationChange("句子..", 4, ".", true)).toEqual({ from: 2, to: 4, insert: "…", cursor: 3 });
    expect(smartPunctuationChange("句子.", 3, ".", true)).toBeNull();
  });

  it("保留围栏代码和行内代码中的标点", () => {
    const inline = "`--`";
    expect(isInsideCode(inline, 3)).toBe(true);
    expect(smartPunctuationChange(inline, 3, "-", true)).toBeNull();

    const fenced = "```js\n--\n```";
    const position = fenced.indexOf("--") + 2;
    expect(isInsideCode(fenced, position)).toBe(true);
    expect(smartPunctuationChange(fenced, position, "-", true)).toBeNull();
    expect(isInsideCode(fenced, fenced.length)).toBe(false);
  });
});
