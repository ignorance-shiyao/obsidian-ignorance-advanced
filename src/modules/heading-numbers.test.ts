import { describe, expect, it } from "vitest";
import { chineseNumeral, formatNumber, numberHeadings, scanHeadings, unpublishedIndexes } from "./heading-numbers";

const at = (levels: number[]) => levels.map((level, index) => ({ level, line: index }));
const texts = (levels: number[]) => [...numberHeadings(at(levels)).values()];

describe("标题编号", () => {
  it("唯一的 H1 视为标题，从 H2 开始编号", () => {
    expect(texts([1, 2, 3, 3, 2, 3])).toEqual(["1", "1.1", "1.2", "2", "2.1"]);
  });
  it("没有 H1 时按最高级别编号", () => {
    expect(texts([2, 3, 2, 3, 4])).toEqual(["1", "1.1", "2", "2.1", "2.1.1"]);
  });
  it("多个 H1 时全部参与编号", () => {
    expect(texts([1, 2, 1, 2])).toEqual(["1", "1.1", "2", "2.1"]);
  });
  it("跳级时用 1 补齐，回到上一级会重置下级", () => {
    expect(texts([2, 4, 2, 3])).toEqual(["1", "1.1.1", "2", "2.1"]);
  });
  it("没有标题时返回空", () => {
    expect(numberHeadings([]).size).toBe(0);
  });

  it("中文数字", () => {
    expect([1, 9, 10, 11, 20, 23, 99, 100].map(chineseNumeral)).toEqual(["一", "九", "十", "十一", "二十", "二十三", "九十九", "100"]);
  });
  it("中文编号风格：一、（一）1.（1）", () => {
    const entries = at([2, 3, 4, 5, 2]);
    expect([...numberHeadings(entries, 4, "chinese").values()]).toEqual(["一、", "（一）", "1.", "（1）", "二、"]);
    expect(formatNumber([3, 2], "decimal")).toBe("3.2");
  });

  it("扫描文档里的标题，跳过属性区和代码块", () => {
    const lines = ["---", "title: x", "---", "# 标题", "```md", "## 不算", "```", "## 概述", "正文", "### 细节"];
    expect(scanHeadings(lines)).toEqual([{ level: 1, line: 3, offset: 2, struck: false }, { level: 2, line: 7, offset: 3, struck: false }, { level: 3, line: 9, offset: 4, struck: false }]);
  });

  it("划掉的标题和它下面的小节都算未发布", () => {
    const entries = [{ level: 2, line: 0 }, { level: 2, line: 3, struck: true }, { level: 3, line: 5 }, { level: 2, line: 8 }];
    expect([...unpublishedIndexes(entries)]).toEqual([1, 2]);
    expect(scanHeadings(["## ~~草稿~~", "## 正式"]).map(item => item.struck)).toEqual([true, false]);
  });
});
