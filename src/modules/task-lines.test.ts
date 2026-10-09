import { describe, expect, it } from "vitest";
import { sourceTaskLines } from "./task-lines.js";

describe("分页任务源码定位", () => {
  it("跳过 frontmatter 和围栏代码，保留嵌套任务与引用任务的行号", () => {
    const lines = [
      "---",
      "notes: '- [ ] 元数据不是任务'",
      "---",
      "- [ ] 第一项",
      "```md",
      "- [ ] Markdown 预览中的任务",
      "```",
      "  - [x] 嵌套任务",
      "> - [ ] 引用任务",
      "~~~text",
      "- [ ] 另一段代码块",
      "~~~"
    ];
    expect(sourceTaskLines(lines.join("\n"))).toEqual([
      { index: 3, line: lines[3] },
      { index: 5, line: lines[5] },
      { index: 7, line: lines[7] },
      { index: 8, line: lines[8] }
    ]);
  });

  it("保留 CRLF 行的原文以便写入前做并发校验", () => {
    expect(sourceTaskLines("- [ ] 待办\r\n正文\r\n- [X] 完成\r\n")).toEqual([
      { index: 0, line: "- [ ] 待办\r" },
      { index: 2, line: "- [X] 完成\r" }
    ]);
  });
});
