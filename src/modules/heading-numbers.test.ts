import { describe, expect, it } from "vitest";
import { chineseNumeral, formatNumber, hasOwnNumber, isSelfNumbered, numberHeadings, numberWithOptions, scanHeadings, unpublishedIndexes } from "./heading-numbers";

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
  it("超过层级上限的标题不编号，也不打乱上层计数", () => {
    const numbers = numberHeadings(at([2, 3, 4, 5, 4, 3]), 3);
    expect([...numbers.values()]).toEqual(["1", "1.1", "1.1.1", "1.1.2", "1.2"]);
    expect(numbers.has(3)).toBe(false);
  });
  it("起始级别：从 H1、从 H2、自动", () => {
    expect([...numberHeadings(at([1, 2, 3]), 4, "decimal", "h1").values()]).toEqual(["1", "1.1", "1.1.1"]);
    expect([...numberHeadings(at([1, 2, 3, 1, 2]), 4, "decimal", "h2").values()]).toEqual(["1", "1.1", "2"]);
    expect([...numberHeadings(at([1, 2, 3]), 4, "decimal", "auto").values()]).toEqual(["1", "1.1"]);
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
    expect(scanHeadings(lines)).toEqual([{ level: 1, line: 3, offset: 2, text: "标题", struck: false }, { level: 2, line: 7, offset: 3, text: "概述", struck: false }, { level: 3, line: 9, offset: 4, text: "细节", struck: false }]);
  });

  it("长围栏里嵌套的短围栏和标题都不算", () => {
    const lines = ["## 前", "````markdown", "# 示例", "```js", "## 不算", "```", "## 也不算", "````", "## 后"];
    expect(scanHeadings(lines).map(item => item.line)).toEqual([0, 8]);
  });
  it("缩进不超过三格的标题、带结尾井号的标题和下划线标题都算", () => {
    const lines = ["  ## 缩进", "", "### 收尾 ###", "", "下划线标题", "====", "", "二级下划线", "---", "", "表格", "|a|b|", "|---|---|", "", "$$", "# 公式里", "$$", "", "- 列表项", "---"];
    expect(scanHeadings(lines).map(item => [item.level, item.line])).toEqual([[2, 0], [3, 2], [1, 4], [2, 7]]);
  });

  it("划掉的标题和它下面的小节都算未发布", () => {
    const entries = [{ level: 2, line: 0 }, { level: 2, line: 3, struck: true }, { level: 3, line: 5 }, { level: 2, line: 8 }];
    expect([...unpublishedIndexes(entries)]).toEqual([1, 2]);
    expect(scanHeadings(["## ~~草稿~~", "## 正式"]).map(item => item.struck)).toEqual([true, false]);
  });
});

describe("标题自带编号", () => {
  it("认出各种自带编号，不误伤普通标题", () => {
    for (const text of ["1. 背景", "1.2 方法", "2、范围", "一、概述", "（一）目标", "(2) 步骤", "第三章 结论", "第3节 小结", "① 要点", "IV. 附录", "A. 附件", "3 Ways to Rest"]) expect(hasOwnNumber(text)).toBe(true);
    for (const text of ["A Quiet Life", "Why We Write", "2024 年度报告", "3D 建模", "一种更安静的生活", "概述", "Introduction"]) expect(hasOwnNumber(text)).toBe(false);
  });
  it("多数标题自带编号的笔记不再自动编号，开关关闭后仍编号", () => {
    const own = scanHeadings(["# 标题", "## 1. 背景", "## 2. 方法", "## 附录"]);
    expect(isSelfNumbered(own)).toBe(true);
    expect(numberWithOptions(own, { depth: 4, style: "decimal", start: "auto" }).size).toBe(0);
    expect(numberWithOptions(own, { depth: 4, style: "decimal", start: "auto", skipOwn: false }).size).toBeGreaterThan(0);
    const plain = scanHeadings(["# 标题", "## 背景", "## 方法"]);
    expect(isSelfNumbered(plain)).toBe(false);
    expect(numberWithOptions(plain, { depth: 4, style: "decimal", start: "auto" }).size).toBe(2);
  });
  it("没有文字信息的标题条目按未编号处理", () => {
    expect(isSelfNumbered([{ level: 2, line: 0 }])).toBe(false);
  });
});
