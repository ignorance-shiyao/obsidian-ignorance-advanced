import { describe, expect, it } from "vitest";
import { fencedCodeContent, parseHighlightedCodeLines } from "./code-lines";

describe("代码块行高亮标记", () => {
  it("解析单行、范围与重复行号", () => {
    expect(parseHighlightedCodeLines("```js {2,4-6,2}")).toEqual([2, 4, 5, 6]);
    expect(parseHighlightedCodeLines("~~~ts {1-3}")).toEqual([1, 2, 3]);
  });

  it("忽略普通代码围栏和无效范围", () => {
    expect(parseHighlightedCodeLines("```js")).toEqual([]);
    expect(parseHighlightedCodeLines("```js title {2,}" )).toEqual([2]);
    expect(parseHighlightedCodeLines("```js {4-2,0,99999-1}")).toEqual([]);
    expect(parseHighlightedCodeLines("普通文本 {2}")).toEqual([]);
  });

  it("可从源 Markdown 按代码内容匹配行高亮，不受其他围栏影响", () => {
    const source = [
      "```mermaid", "flowchart LR", "A-->B", "```",
      "```js {2}", "const a = 1;", "const b = 2;", "```",
      "```js", "const c = 3;", "```"
    ].join("\n");
    expect(parseHighlightedCodeLines(source.split("\n")[4])).toEqual([2]);
    expect(parseHighlightedCodeLines(source.split("\n")[8])).toEqual([]);
  });
});

it("保留块对齐设置同时解析指定高亮行", () => {
  expect(parseHighlightedCodeLines("```js {2,4-6} {align=right}")).toEqual([2,4,5,6]);
  expect(parseHighlightedCodeLines("~~~ts {align=left} {1-2}")).toEqual([1,2]);
});

it("围栏正文保留作者空行，并按源位置区分相同代码", () => {
  const source = '# Sample\n\n```js\nfirst\n\n```\n\n~~~js\nfirst\n~~~';
  expect(fencedCodeContent(source, 2)).toBe('first\n');
  expect(fencedCodeContent(source, 7)).toBe('first');
  expect(fencedCodeContent(source, 3)).toBeUndefined();
  expect(fencedCodeContent('```js\nfirst', 0)).toBeUndefined();
});
