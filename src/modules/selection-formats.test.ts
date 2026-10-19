import { describe, expect, it } from "vitest";
import { SELECTION_FORMATS, applyFormat, referenceItems, toCallout } from "./selection-formats";

const byId = (id: string) => SELECTION_FORMATS.find(format => format.id === id);

describe("selection formats", () => {
  it("has unique ids and a name for each", () => {
    expect(new Set(SELECTION_FORMATS.map(format => format.id)).size).toBe(SELECTION_FORMATS.length);
    expect(SELECTION_FORMATS.every(format => format.name && format.group)).toBe(true);
  });
  it("wraps inline text", () => {
    expect(applyFormat(byId("highlight-yellow"), "重点").text).toBe("==重点==");
    expect(applyFormat(byId("highlight-red"), "重点").text).toBe("<mark data-highlight=\"red\">重点</mark>");
    expect(applyFormat(byId("badge-green"), "通过").text).toBe("((green:通过))");
    expect(applyFormat(byId("spoiler"), "答案").text).toBe("((spoiler:答案))");
  });
  it("leaves the placeholder selected", () => {
    const result = applyFormat(byId("ruby"), "汉字");
    expect(result.text).toBe("((ruby:汉字 | 注音))");
    expect(result.text.slice(result.selectFrom, result.selectTo)).toBe("注音");
  });
  it("converts lines to a callout without losing content", () => {
    expect(toCallout("第一行\n\n第三行\n", "tip")).toBe("> [!tip]\n> 第一行\n>\n> 第三行");
  });
  it("builds container and caption blocks", () => {
    expect(applyFormat(byId("tabs"), "内容").text).toBe("::: tabs\n::: tab 第一页\n内容\n:::\n:::");
    expect(applyFormat(byId("caption-table"), " 销售额 ").text).toBe("表：销售额 {#tab-id}");
  });
  it("lists references", () => {
    expect(referenceItems(["fig-a"])).toEqual([{ id: "fig-a", text: "((ref:fig-a))" }]);
  });
});
