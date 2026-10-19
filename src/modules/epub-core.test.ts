import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { absolutizeLinks, buildEpub, combineMarkdown, itemProperties, imageMime, parseNoteList, chapterFile, escapeXml, navDocument, packageDocument } from "./epub-core";

const meta = { title: "三章 & 样本", author: "作者", language: "zh-CN", id: "urn:uuid:1", date: "2026-10-19T00:00:00Z" };
const chapters = [{ title: "第一章", body: "<h1>一</h1><p>x</p>" }, { title: "第一章", body: "<p>同名章节</p>" }, { title: "三 <3>", body: "<p>z</p>" }];

describe("epub packaging", () => {
  it("escapes text and numbers chapter files", () => {
    expect(escapeXml('a&b<c>"d"')).toBe("a&amp;b&lt;c&gt;&quot;d&quot;");
    expect(chapterFile(0)).toBe("ch-01.xhtml");
    expect(chapterFile(11)).toBe("ch-12.xhtml");
  });
  it("lists every chapter in the table of contents, including repeated titles", () => {
    const nav = navDocument(meta, chapters);
    expect(nav.match(/<li>/g)?.length).toBe(3);
    expect(nav).toContain("三 &lt;3&gt;");
    expect(nav).toContain('epub:type="toc"');
  });
  it("declares images and the reading order", () => {
    const opf = packageDocument(meta, chapters, [{ name: "img-001.png", mime: "image/png", data: new Uint8Array() }]);
    expect(opf).toContain('href="images/img-001.png"');
    expect(opf).toContain('<itemref idref="c3"/>');
    expect(opf).toContain("<dc:creator>作者</dc:creator>");
    expect(opf).toContain("三章 &amp; 样本");
  });
  it("writes mimetype first and uncompressed", async () => {
    const bytes = await buildEpub(meta, chapters, [{ name: "a.png", mime: "image/png", data: new Uint8Array([1, 2, 3]) }]);
    expect(new TextDecoder().decode(bytes.slice(30, 38))).toBe("mimetype");
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)[0]).toBe("mimetype");
    expect(await zip.file("mimetype")?.async("string")).toBe("application/epub+zip");
    expect(Object.keys(zip.files).some(name => name.endsWith("/"))).toBe(false);
    expect(zip.file("OEBPS/ch-02.xhtml")).not.toBeNull();
    expect((await zip.file("OEBPS/images/a.png")?.async("uint8array"))?.length).toBe(3);
  });
  it("reads a list of notes in several spellings", () => {
    expect(parseNoteList("[[第一章]]\n- [[第二章|二]]\n 第三章.md \n\n[[第一章#小节]]")).toEqual(["第一章", "第二章", "第三章"]);
  });
  it("knows the image types an ePub can carry", () => {
    expect(imageMime("PNG")).toBe("image/png");
    expect(imageMime("bmp")).toBeNull();
  });
  it("joins notes for Word without their front matter", () => {
    expect(combineMarkdown(["---\ntags: x\n---\n# 一\n文", "# 二\n\n", "", "---\na: 1\n---\n# 三"])).toBe("# 一\n文\n\n# 二\n\n# 三");
  });
  it("declares svg and mathml chapters in the package document", () => {
    expect(itemProperties("<p>x</p>")).toBe("");
    expect(itemProperties('<p><svg width="1"></svg></p>')).toBe(' properties="svg"');
    expect(itemProperties("<math><mi>x</mi></math><svg/>")).toBe(' properties="svg mathml"');
    expect(packageDocument(meta, [{ title: "a", body: "<svg></svg>" }], [])).toContain('href="ch-01.xhtml" media-type="application/xhtml+xml" properties="svg"');
  });
});

describe("absolutizeLinks", () => {
  const vault: Record<string, string> = { "assets/架构.png": "B/assets/架构.png", "其他": "C/其他.md", "a b.png": "B/a b.png" };
  const run = (text: string) => absolutizeLinks(text, target => vault[target] ?? null);
  it("rewrites wiki and Markdown links to the note's own files", () => {
    expect(run("![[assets/架构.png|300]] 见 [[其他#小节|这里]]")).toBe("![[B/assets/架构.png|300]] 见 [[C/其他.md#小节|这里]]");
    expect(run("![图](assets/%E6%9E%B6%E6%9E%84.png) [x](<a b.png> \"t\")")).toBe("![图](B/assets/架构.png) [x](B/a%20b.png \"t\")");
  });
  it("leaves web links, anchors, unknown targets and code alone", () => {
    const text = "[w](https://x.cn/a.png) [[#本篇]] [[缺失]] `![[assets/架构.png]]`\n```\n![[assets/架构.png]]\n```";
    expect(run(text)).toBe(text);
  });
});
