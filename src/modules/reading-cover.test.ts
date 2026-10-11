import { describe, expect, it } from "vitest";
import { coverFields } from "./reading-cover";

describe("阅读视图封面", () => {
  it("从属性取标题、副标题、作者、日期和标签", () => {
    const fields = coverFields({ title: "年度报告", description: "2026 年度", author: ["[[张三]]", "李四"], created: "2026-10-12T08:00:00", tags: ["#报告", "年度"] }, "文件名");
    expect(fields).toEqual({ title: "年度报告", subtitle: "2026 年度", authors: ["张三", "李四"], date: "2026-10-12", tags: ["报告", "年度"] });
  });
  it("没有属性时用文件名，其余为空", () => {
    expect(coverFields(undefined, "笔记")).toEqual({ title: "笔记", subtitle: "", authors: [], date: "", tags: [] });
  });
  it("作者可以是单个字符串，subtitle 优先于 description", () => {
    const fields = coverFields({ author: "王五", subtitle: "副", description: "描述" }, "x");
    expect(fields.authors).toEqual(["王五"]);
    expect(fields.subtitle).toBe("副");
  });
});
