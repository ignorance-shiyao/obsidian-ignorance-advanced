import { describe, expect, it } from "vitest";
import { numberHeadings } from "./heading-numbers";

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
});
