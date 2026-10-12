import { describe, expect, it } from "vitest";
import { missingBlankLines, withBlankLines } from "./missing-blank-lines-core";

describe("漏打空行的表格", () => {
  it("段落后紧跟表格时在表格前补一个空行", () => {
    const text = "4.环节调整\n| 环节 | 内容 |\n| --- | --- |\n| 发现 | 告警 |";
    expect(withBlankLines(text)).toBe("4.环节调整\n\n| 环节 | 内容 |\n| --- | --- |\n| 发现 | 告警 |");
  });
  it("已有空行、标题后、代码围栏里的表格都不动", () => {
    expect(missingBlankLines(["正文", "", "| a | b |", "| - | - |"])).toEqual([]);
    expect(missingBlankLines(["## 标题", "| a | b |", "| - | - |"])).toEqual([]);
    expect(missingBlankLines(["```md", "文字", "| a | b |", "| - | - |", "```"])).toEqual([]);
  });
  it("列数对不上就不是表格", () => {
    expect(missingBlankLines(["文字", "| a | b |", "| - |"])).toEqual([]);
    expect(missingBlankLines(["文字 | 竖线", "不是分隔行"])).toEqual([]);
  });
  it("属性区之后的第一行、引用与列表项的缩进表格不处理", () => {
    expect(missingBlankLines(["---", "a: 1", "---", "| a | b |", "| - | - |"])).toEqual([]);
    expect(missingBlankLines(["> 引用", "> | a | b |", "> | - | - |"])).toEqual([]);
    expect(missingBlankLines(["- 项", "    | a | b |", "    | - | - |"])).toEqual([]);
  });
  it("列表项后紧跟顶格表格也补空行", () => {
    expect(missingBlankLines(["- 项", "| a | b |", "| - | - |"])).toEqual([1]);
  });
});
