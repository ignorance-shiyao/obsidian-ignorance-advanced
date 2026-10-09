import { afterEach, describe, expect, it, vi } from "vitest";
import { renderBudget } from "./render-budget";

afterEach(() => vi.useRealTimers());
describe("预览生成让出主线程与取消", () => {
  it("超出预算后让输入事件执行，再继续生成", async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const checkpoint = renderBudget(undefined, 8);
    await vi.advanceTimersByTimeAsync(10);
    setTimeout(() => events.push("输入"), 0);
    const work = checkpoint().then(() => events.push("生成"));
    await vi.runAllTimersAsync();
    await work;
    expect(events).toEqual(["输入", "生成"]);
  });
  it("关闭预览后拒绝后续生成", async () => {
    const controller = new AbortController();
    const checkpoint = renderBudget(controller.signal);
    controller.abort();
    await expect(checkpoint()).rejects.toMatchObject({ name: "AbortError" });
  });
});
