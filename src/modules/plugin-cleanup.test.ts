import { describe, expect, it, vi } from "vitest";
import { guardedCleanup, restoreGlobalProperty } from "./plugin-cleanup";

describe("卸载清理与全局属性恢复", () => {
  it("非配置全局变量仍能清空值，不抛异常", () => {
    const target = {};
    Object.defineProperty(target, "loader", { value: {}, writable: true, configurable: false });
    expect(() => restoreGlobalProperty(target, "loader", undefined)).not.toThrow();
    expect(target.loader).toBeUndefined();
  });
  it("恢复原有描述符，包括原本值为 undefined 的属性", () => {
    const previous = { value: undefined, writable: false, enumerable: true, configurable: true };
    const target = { loader: {} };
    restoreGlobalProperty(target, "loader", previous);
    expect(Object.getOwnPropertyDescriptor(target, "loader")).toEqual(previous);
  });
  it("一个清理步骤失败不妨碍后续注销", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const calls: string[] = [];
      const steps = [guardedCleanup(() => { throw Error("故障"); }), guardedCleanup(() => calls.push("注销"))];
      steps.forEach(step => step());
      expect(calls).toEqual(["注销"]);
      expect(error).toHaveBeenCalledOnce();
    } finally { error.mockRestore(); }
  });
});
