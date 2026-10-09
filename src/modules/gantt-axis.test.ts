import { expect, it } from "vitest";
import { ganttTickInterval } from "./gantt-axis";
const task = (days: number) => ({ startTime: new Date(2026, 2, 1), endTime: new Date(+new Date(2026, 2, 1) + days * 86400000) });
it("月级任务保留可分辨的日期间隔", () => {
  expect(ganttTickInterval([task(36)], 560)).toBe("1week");
});
it("小时级任务不会被强制变成周刻度", () => {
  expect(ganttTickInterval([task(1 / 24)], 560)).toBe("15minute");
});
it("窄图减少刻度数量，宽图提供更多刻度", () => {
  expect(ganttTickInterval([task(14)], 128)).toBe("1week");
  expect(ganttTickInterval([task(14)], 768)).toBe("2day");
});
it("作者间隔、空任务和无跨度不被替换", () => {
  expect(ganttTickInterval([task(36)], 560, "1day")).toBeNull();
  expect(ganttTickInterval([], 560)).toBeNull();
  expect(ganttTickInterval([task(0)], 560)).toBeNull();
});
