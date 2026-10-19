import { describe, expect, it } from "vitest";
import { clipKey, tidyMarkdown, frontmatter, isClipUrl } from "./web-clip-format";

describe("web clip", () => {
  it("strips heading bold and nbsp padding", () => {
    expect(tidyMarkdown("## **01 问题**\n\n\n   **重点**  \n- 列表")).toBe("## 01 问题\n\n**重点**\n- 列表");
  });
  it("writes the clipper properties", () => {
    const text = frontmatter({ title: "标题", url: "https://a.b/c", author: "清新研究", published: "2026-09-29", description: "摘要" });
    expect(text).toContain('title: "标题"');
    expect(text).toContain('source: "https://a.b/c"');
    expect(text).toContain('  - "[[清新研究]]"');
    expect(text).toContain("published: 2026-09-29");
    expect(text).toContain('  - "Clippings"');
  });
  it("recognises a lone link only", () => {
    expect(isClipUrl(" https://mp.weixin.qq.com/s/abc ")).toBe(true);
    expect(isClipUrl("看这个 https://x.com/a")).toBe(false);
  });
  it("treats tracking parameters, fragments and a trailing slash as the same page", () => {
    expect(clipKey("https://A.com/post/?utm_source=x&id=7#top")).toBe("https://a.com/post?id=7");
    expect(clipKey("https://a.com/post?id=7")).toBe("https://a.com/post?id=7");
    expect(clipKey("https://mp.weixin.qq.com/s?__biz=A&mid=1&sn=z")).toBe("https://mp.weixin.qq.com/s?__biz=A&mid=1&sn=z");
    expect(clipKey("not a url")).toBe("not a url");
  });
});
