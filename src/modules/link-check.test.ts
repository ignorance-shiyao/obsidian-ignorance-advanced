import { describe, expect, it } from "vitest";
import { analyzeNote } from "./link-check";

const files: Record<string, string[]> = { 笔记甲: ["简介", "用法"], 笔记乙: [] };
const resolve = (path: string) => files[path] ?? null;

describe("链接检查", () => {
  it("找出不存在的笔记与嵌入", () => {
    const problems = analyzeNote([{ link: "不存在", line: 2, kind: "link" }, { link: "图.png", line: 4, kind: "embed" }, { link: "笔记甲", line: 6, kind: "link" }], [], resolve);
    expect(problems.map(item => [item.kind, item.line])).toEqual([["missing-file", 2], ["missing-file", 4]]);
  });
  it("检查标题锚点，忽略块引用，标题比较不区分大小写与空白", () => {
    const problems = analyzeNote([
      { link: "笔记甲#用法", line: 1, kind: "link" },
      { link: "笔记甲#没有", line: 2, kind: "link" },
      { link: "笔记甲#^abc", line: 3, kind: "link" },
      { link: "#  Intro ", line: 4, kind: "link" }
    ], [{ text: "intro", level: 2, line: 0 }], resolve);
    expect(problems.map(item => [item.kind, item.line])).toEqual([["missing-heading", 2]]);
  });
  it("同级重名标题", () => {
    const problems = analyzeNote([], [{ text: "概述", level: 2, line: 1 }, { text: "概述", level: 2, line: 9 }, { text: "概述", level: 3, line: 12 }], resolve);
    expect(problems).toEqual([{ kind: "duplicate-heading", text: "概述", line: 9, detail: "同级标题重名，共 2 处" }]);
  });
});
