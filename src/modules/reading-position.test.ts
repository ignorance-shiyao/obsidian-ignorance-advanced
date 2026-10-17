import { describe, expect, it } from "vitest";
import { mergePositions } from "./reading-position";

describe("阅读位置跨设备合并", () => {
  it("采用另一台设备写入的位置", () => {
    expect(mergePositions({ "a.md": 40, "b.md": 12 }, { "a.md": 10 }, [])).toEqual({ "a.md": 40, "b.md": 12 });
  });

  it("本机在这期间读过的笔记以本机为准，并排到最近", () => {
    const merged = mergePositions({ "a.md": 40, "b.md": 12 }, { "a.md": 55, "c.md": 3 }, ["a.md", "c.md"]);
    expect(merged).toEqual({ "b.md": 12, "a.md": 55, "c.md": 3 });
    expect(Object.keys(merged)).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("本机清除的位置不会被另一台设备的旧值带回来", () => {
    expect(mergePositions({ "a.md": 40 }, {}, ["a.md"])).toEqual({});
  });

  it("超过上限时丢掉最久未读的", () => {
    expect(Object.keys(mergePositions({ "a.md": 1, "b.md": 2 }, { "c.md": 3 }, ["c.md"], 2))).toEqual(["b.md", "c.md"]);
  });

  it("另一台设备没有数据时保留本机的改动", () => {
    expect(mergePositions(undefined, { "a.md": 7 }, ["a.md"])).toEqual({ "a.md": 7 });
  });
});
