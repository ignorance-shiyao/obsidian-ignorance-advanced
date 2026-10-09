import { describe, expect, it } from "vitest";
import { firstScreenSource } from "./first-screen-source";

describe("预览首屏截取", () => {
  const tail = "\n\n后续正文".repeat(300);
  it("短笔记只渲染一次", () => {
    expect(firstScreenSource("# 标题\n\n短正文", 100)).toBeNull();
  });
  it("保留完整代码块，支持长围栏及波浪线", () => {
    for (const marker of ["````", "~~~"]) {
      const opening = `# 开头\n\n${marker}mermaid\n${"A --> B\n\n".repeat(20)}${marker}`;
      expect(firstScreenSource(opening + tail, 100)?.trimEnd()).toBe(opening);
    }
  });
  it("保留嵌套容器，不把双栏拆开", () => {
    const opening = `# 标题\n\n:::cols\n:::panel 第一列\n${"正文\n\n".repeat(30)}:::\n:::panel 第二列\n第二列内容\n:::\n:::`;
    expect(firstScreenSource(opening + tail, 100)?.trimEnd()).toBe(opening);
  });
  it("围栏里的容器标记不会改变截取层级", () => {
    const opening = `# 标题\n\n\`\`\`text\n:::panel\n${"正文\n\n".repeat(30)}\`\`\``;
    expect(firstScreenSource(opening + tail, 100)?.trimEnd()).toBe(opening);
  });
  it("没有安全分界时等待完整渲染", () => {
    expect(firstScreenSource("```text\n" + "长正文".repeat(500), 100)).toBeNull();
  });
});
