import { describe, expect, it } from "vitest";
import {
  displayWidth,
  editTableLines,
  findPipeTableAtLine,
  formatTableLines,
  parsePipeRow
} from "./table-edit";

const table = [
  "| 姓名 | Name |",
  "| --- | :---: |",
  "| 张三 | Amy |",
  "| 李四 | 好人 |"
];

describe("Markdown 表格纯函数", () => {
  it("中日韩宽字符按两格计算，格式化后各列对齐", () => {
    expect(displayWidth("姓名")).toBe(4);
    expect(displayWidth("产品 A")).toBe(6);
    const formatted = formatTableLines(table)!;
    expect(formatted).toEqual([
      "| 姓名 | Name  |",
      "| ---- | :---: |",
      "| 张三 | Amy   |",
      "| 李四 | 好人  |"
    ]);
  });

  it("保留代码跨度与转义管道符中的竖线", () => {
    const cells = parsePipeRow("| `a|b` | left\\|right | end | ")!;
    expect(cells.map(cell => cell.value)).toEqual(["`a|b`", "left\\|right", "end"]);
  });

  it("插入、移动与删除表格行", () => {
    const inserted = editTableLines(table, "row-add-below", 2, 1);
    expect(inserted?.lines).toHaveLength(5);
    expect(inserted?.rowIndex).toBe(3);
    expect(parsePipeRow(inserted?.lines[3] || "")?.[0].value).toBe("");

    const moved = editTableLines(table, "row-move-down", 2, 0)!;
    expect(parsePipeRow(moved.lines[2])?.[0].value).toBe("李四");
    expect(parsePipeRow(moved.lines[3])?.[0].value).toBe("张三");

    const deleted = editTableLines(table, "row-delete", 3, 0)!;
    expect(deleted.lines).toHaveLength(3);
    expect(deleted.lines.join("\n")).not.toContain("李四");
  });

  it("增删和移动列时同步更新表头、分隔线与数据", () => {
    const added = editTableLines(table, "column-add-right", 2, 0)!;
    expect(parsePipeRow(added.lines[0])?.map(cell => cell.value)).toEqual(["姓名", "", "Name"]);
    expect(parsePipeRow(added.lines[2])?.map(cell => cell.value)).toEqual(["张三", "", "Amy"]);

    const moved = editTableLines(table, "column-move-right", 2, 0)!;
    expect(parsePipeRow(moved.lines[0])?.map(cell => cell.value)).toEqual(["Name", "姓名"]);
    expect(parsePipeRow(moved.lines[2])?.map(cell => cell.value)).toEqual(["Amy", "张三"]);

    const deleted = editTableLines(table, "column-delete", 2, 1)!;
    expect(parsePipeRow(deleted.lines[0])?.map(cell => cell.value)).toEqual(["姓名"]);
    expect(editTableLines(["| only |", "| --- |"], "column-delete", 2, 0)).toBeNull();
  });

  it("识别普通表格，但忽略围栏代码里的表格文本", () => {
    const lines = [
      "| outside |",
      "| --- |",
      "| value |",
      "",
      "```markdown",
      "| inside |",
      "| --- |",
      "| code |",
      "```"
    ];
    expect(findPipeTableAtLine(lines, 1)?.lines).toEqual(lines.slice(0, 3));
    expect(findPipeTableAtLine(lines, 6)).toBeNull();
  });
});
