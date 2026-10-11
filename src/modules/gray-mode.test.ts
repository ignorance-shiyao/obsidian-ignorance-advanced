import { describe, expect, it } from "vitest";
import { isGrayDay, parseGrayDates } from "./gray-mode";

describe("灰度模式日期", () => {
  it("解析多种分隔与写法", () => {
    expect([...parseGrayDates("4-4\n12/13, 9月18日；13.12")].sort()).toEqual(["04-04", "09-18", "12-13"]);
  });
  it("忽略不合法的日期", () => {
    expect(parseGrayDates("13-1 0-5 abc 2-32").size).toBe(0);
  });
  it("按月日判断当天", () => {
    const dates = parseGrayDates("4-4");
    expect(isGrayDay(dates, new Date(2026, 3, 4))).toBe(true);
    expect(isGrayDay(dates, new Date(2026, 3, 5))).toBe(false);
  });
});
