import { describe, expect, it } from "vitest";
import { localDate, renderFooter } from "./page-footer";

describe("页脚模板", () => {
  const values = { title: "年度报告", page: 3, pages: 12, date: "2026-10-12" };
  it("替换标题、页码、总页数和日期", () => {
    expect(renderFooter("{title} · {date}", values)).toBe("年度报告 · 2026-10-12");
    expect(renderFooter("第 {page} 页，共 {pages} 页", values)).toBe("第 3 页，共 12 页");
  });
  it("空模板得到空文字，重复占位符都替换", () => {
    expect(renderFooter("", values)).toBe("");
    expect(renderFooter("{page}/{page}", values)).toBe("3/3");
  });
  it("日期按本地时间补零", () => {
    expect(localDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
