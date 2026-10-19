import { describe, expect, it } from "vitest";
import { readSourceInfo, sourceCardMarkdown } from "./source-card-core";

describe("source card", () => {
  it("writes a callout with title, description and link", () => {
    const text = sourceCardMarkdown({ title: "标题 [x]", description: "一段\n说明", site: "站点", url: "https://a.com/p" });
    expect(text).toBe("> [!source] 标题 \\[x\\]\n> 一段 说明\n> [站点](https://a.com/p)");
  });
  it("uses the host name when the site name is missing", () => {
    expect(sourceCardMarkdown({ title: "T", description: "", site: "", url: "https://www.b.org/x" })).toBe("> [!source] T\n> [b.org](https://www.b.org/x)");
  });
  it("falls back to a plain link without a title", () => {
    expect(sourceCardMarkdown({ title: "", description: "d", site: "", url: "https://www.b.org/x" })).toBe("[b.org](https://www.b.org/x)");
  });
  it("reads Open Graph, then ordinary meta and the title tag", () => {
    const html = '<html><head><title>页面</title><meta name="description" content="普通说明"><meta property="og:title" content="OG 标题"><meta property="og:site_name" content="站名"></head></html>';
    expect(readSourceInfo(html, "https://a.com")).toEqual({ title: "OG 标题", description: "普通说明", site: "站名", url: "https://a.com" });
    expect(readSourceInfo("<title> 仅标题 </title>", "https://a.com").title).toBe("仅标题");
  });
});
