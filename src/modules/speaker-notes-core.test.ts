import { describe, expect, it } from "vitest";
import { extractSpeakerNotes, formatElapsed } from "./speaker-notes-core";

describe("speaker notes", () => {
  it("reads one-line and multi-line notes", () => {
    expect(extractSpeakerNotes("# 标题\n%%notes: 先讲背景%%\n正文")).toBe("先讲背景");
    expect(extractSpeakerNotes("%% 备注：\n第一句\n  第二句\n%%")).toBe("第一句\n第二句");
    expect(extractSpeakerNotes("%%讲稿：全角冒号%%")).toBe("全角冒号");
  });
  it("joins several notes and ignores ordinary comments", () => {
    expect(extractSpeakerNotes("%%note: a%%\n中间\n%%notes: b%%")).toBe("a\n\nb");
    expect(extractSpeakerNotes("%% 只是普通注释 %%")).toBe("");
  });
  it("skips notes inside code fences", () => {
    expect(extractSpeakerNotes("```md\n%%notes: 示例%%\n```\n%%notes: 真的%%")).toBe("真的");
  });
  it("formats the timer", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_000)).toBe("01:05");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
    expect(formatElapsed(-5)).toBe("00:00");
  });
});
