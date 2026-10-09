import { describe, expect, it } from "vitest";
import { parseSlideLayout } from "./layout";
import { normalizePresentationSkin } from "./skin-choice";
import { splitSlides } from "./split";

describe("演示模式 Markdown 解析", () => {
  it("支持计划中的 9 种显式版式，并读取页眉标签", () => {
    const layouts = ["cover", "section", "center", "default", "split", "grid", "image-left", "image-right", "image-full"];
    for (const layout of layouts) {
      expect(parseSlideLayout(`<!-- layout: ${layout} | 业务分析 -->\n# 页面`).layout).toBe(layout);
      expect(parseSlideLayout(`<!-- layout: ${layout} | 业务分析 -->\n# 页面`).tag).toBe("业务分析");
    }
    expect(parseSlideLayout("<!-- layout: unknown -->\n正文").layout).toBe("default");
  });

  it("按内容推断封面、引言、图像和双栏版式", () => {
    const cases: Array<[string, string]> = [
      ["# 项目复盘\n关键结论", "cover"],
      ["> 用户要的是稳定\n> 不是更多按钮", "center"],
      ["![图一](one.png)\n![图二](two.png)", "grid"],
      ["![主图](cover.png)\n说明文字", "image-right"],
      ["![一](one.png)\n![二](two.png)\n![三](three.png)", "image-full"],
      [Array.from({ length: 12 }, (_, index) => `- 重点 ${index + 1}`).join("\n"), "split"],
      ["## 正文\n普通段落\n补充说明", "default"],
    ];
    for (const [markdown, expected] of cases) {
      expect(parseSlideLayout(markdown).layout).toBe(expected);
    }
  });

  it("仅在围栏外按 --- 与 -- 分页", () => {
    const markdown = [
      "封面",
      "---",
      "章节 A",
      "```md",
      "---",
      "--",
      "```",
      "--",
      "章节 A 续页",
      "~~~text",
      "---",
      "~~~",
      "---",
      "章节 B",
    ].join("\n");
    expect(splitSlides(markdown).columns).toEqual([
      ["封面"],
      ["章节 A\n```md\n---\n--\n```", "章节 A 续页\n~~~text\n---\n~~~"],
      ["章节 B"],
    ]);
  });

  it("旧皮肤迁移到主题色，未知选择回到跟随主题", () => {
    expect(normalizePresentationSkin("swiss")).toBe("palette-azure-light");
    expect(normalizePresentationSkin("dracula")).toBe("palette-wisteria-dark");
    expect(normalizePresentationSkin("palette-pine-dark")).toBe("palette-pine-dark");
    expect(normalizePresentationSkin("unknown")).toBe("none");
  });
});
