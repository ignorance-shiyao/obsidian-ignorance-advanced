import { describe, expect, it } from "vitest";
import { estimateReading } from "./reading-time";

describe("阅读时长估算", () => {
  it("汉字按 400 字每分钟，英文按 230 词每分钟", () => {
    expect(estimateReading("字".repeat(800)).minutes).toBe(2);
    expect(estimateReading("word ".repeat(460)).minutes).toBe(2);
  });
  it("忽略 front matter、代码块、注释和链接目标", () => {
    const text = "---\ntitle: x\n---\n```js\nconst a = 1;\n```\n<!-- 注释注释注释 -->\n[链接](https://example.com/very/long)\n";
    expect(estimateReading(text)).toMatchObject({ cjk: 2, words: 0, minutes: 1 });
  });
  it("空内容不显示", () => {
    expect(estimateReading("").minutes).toBe(0);
    expect(estimateReading("---\na: 1\n---\n").minutes).toBe(0);
  });
});
