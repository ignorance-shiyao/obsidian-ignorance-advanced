import { describe, expect, it } from "vitest";
import { appUrlsToFileUrls, buildPrintHtml } from "./pdf-direct-core.js";

describe("appUrlsToFileUrls", () => {
  it("turns vault resource addresses into file addresses", () => {
    expect(appUrlsToFileUrls('<img src="app://1a2b3c4d5e6f7a8b/home/u/vault/a.png?12">')).toBe('<img src="file:///home/u/vault/a.png?12">');
    expect(appUrlsToFileUrls("url(app://1a2b3c4d5e6f7a8b/C:/vault/a.png)")).toBe("url(file:///C:/vault/a.png)");
  });
  it("leaves other addresses alone", () => {
    expect(appUrlsToFileUrls("app://obsidian.md/app.css")).toBe("app://obsidian.md/app.css");
    expect(appUrlsToFileUrls("https://a.com/x.png")).toBe("https://a.com/x.png");
  });
});

describe("buildPrintHtml", () => {
  const parts = { title: "A & <B>", htmlClass: 'x "y"', bodyClass: "theme-light", bodyStyle: "--a: 1", css: ".a{}", stageHtml: '<div class="ibp-print-root"></div>', widthMm: 210, heightMm: 297 };
  const html = buildPrintHtml(parts);
  it("sizes the paper and keeps the stage", () => {
    expect(html).toContain("@page { size: 210mm 297mm; margin: 0; }");
    expect(html).toContain('<div class="ibp-print-root"></div>');
  });
  it("shows the stage over Obsidian's rule that hides every other body child", () => {
    expect(html).toContain("@media print { html body > .ibp-print-root.ibp-print-root { display: block !important; } }");
  });
  it("escapes the title and attributes", () => {
    expect(html).toContain("<title>A &amp; &lt;B></title>");
    expect(html).toContain('class="x &quot;y&quot;"');
  });
});
