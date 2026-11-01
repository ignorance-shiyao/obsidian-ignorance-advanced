import { describe, expect, it } from "vitest";
import { listColumns, progressTone, progressValue, ruleLeadsToList, taskProgressAfter } from "./list-extras-core";

describe("列表分栏", () => {
  const lines = ["段落", "", "---", "", "---", "", "- 一", "  - 子", "- 二", "", "---", "", "正文"];
  it("列表前的分割线数量决定栏数", () => {
    expect(listColumns(lines, 6)).toBe(3);
    expect(listColumns(["- a"], 0)).toBe(1);
    expect(listColumns(["---", "---", "---", "---", "---", "- a"], 5)).toBe(5);
  });
  it("只隐藏通向列表的分割线", () => {
    expect(ruleLeadsToList(lines, 2)).toBe(true);
    expect(ruleLeadsToList(lines, 4)).toBe(true);
    expect(ruleLeadsToList(lines, 10)).toBe(false);
  });
});

describe("进度条", () => {
  it("? 统计后面任务清单的完成度", () => {
    const lines = ["**任务进度：** **==?==**", "", "- [x] 一", "  - [ ] 子一", "  - [x] 子二", "- [ ] 二", "", "后文 - [x] 不算"];
    expect(taskProgressAfter(lines, 0)).toBe(50);
    expect(taskProgressAfter(["没有任务", "", "正文"], 0)).toBeNull();
  });
  it("数值与配色", () => {
    expect(progressValue("80.5")).toBe(80.5);
    expect(progressValue("-35")).toBe(-35);
    expect(progressValue("？")).toBe("auto");
    expect(progressValue("abc")).toBeNull();
    expect(progressTone(-1)).toBe("rd");
    expect(progressTone(100)).toBe("gn");
    expect(progressTone(120)).toBe("og");
    expect(progressTone(50)).toBeNull();
  });
});
