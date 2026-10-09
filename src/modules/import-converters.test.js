import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  csvToMarkdown,
  htmlToMarkdown,
  jsonToMarkdown,
  notionZipToMarkdown,
  parseDelimited,
  pdfToMarkdown,
  pptxToMarkdown,
  rowsToTable,
  safeZipPath,
  stripNotionHash,
  xlsxToMarkdown
} from "./import-converters.js";

describe("CSV / TSV converters", () => {
  it("handles quoted delimiters, escaped quotes, and newlines", () => {
    expect(parseDelimited('name,quote\nAlice,"a,b"\nBob,"say ""hi"""', ",")).toEqual([
      ["name", "quote"], ["Alice", "a,b"], ["Bob", 'say "hi"']
    ]);
  });

  it("turns rows into a padded GFM table and escapes pipes", () => {
    expect(csvToMarkdown("name\tage\nAda|Lovelace\t36", "\t")).toBe(
      "| name | age |\n| --- | --- |\n| Ada\\|Lovelace | 36 |"
    );
    expect(rowsToTable([["", ""], ["", ""]])).toBe("");
  });
});

describe("JSON converter", () => {
  it("converts flat object arrays to tables", () => {
    expect(jsonToMarkdown('[{"name":"Ada","n":1},{"name":"Lin","n":2}]')).toBe(
      "| name | n |\n| --- | --- |\n| Ada | 1 |\n| Lin | 2 |"
    );
  });

  it("keeps nested data as formatted JSON and rejects malformed input", () => {
    expect(jsonToMarkdown('{"user":{"name":"Ada"}}')).toContain('"name": "Ada"');
    expect(() => jsonToMarkdown("not-json")).toThrow("JSON 文件格式无效");
  });
});

describe("XLSX converter", () => {
  it("exports each non-empty worksheet with its name and a Markdown table", async () => {
    const exceljs = await import("exceljs");
    const ExcelJS = exceljs.default?.Workbook ? exceljs.default : exceljs;
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Colors").addRows([["name", "count"], ["blue", 2]]);
    workbook.addWorksheet("Places").addRows([["city"], ["Suzhou"]]);
    const bytes = await workbook.xlsx.writeBuffer();
    const markdown = await xlsxToMarkdown(new Uint8Array(bytes));
    expect(markdown).toContain("## Colors");
    expect(markdown).toContain("| blue | 2 |");
    expect(markdown).toContain("## Places");
    expect(markdown).toContain("| Suzhou |");
  });
});

describe("PPTX converter", () => {
  it("extracts paragraph text in numeric slide order and decodes XML entities", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide2.xml", '<p:sld><a:p><a:r><a:t>Second &amp; final</a:t></a:r></a:p></p:sld>');
    zip.file("ppt/slides/slide1.xml", '<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p><a:p><a:r><a:t>line two</a:t></a:r></a:p></p:sld>');
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const markdown = await pptxToMarkdown(bytes);
    expect(markdown.indexOf("第 1 页")).toBeLessThan(markdown.indexOf("第 2 页"));
    expect(markdown).toContain("First\n\nline two");
    expect(markdown).toContain("Second & final");
  });
});

describe("HTML converter", () => {
  it("keeps semantic headings, tables, and local image references while removing scripts", async () => {
    const markdown = await htmlToMarkdown('<h1>Report</h1><p>Summary <strong>bold</strong></p><table><tr><th>Name</th><th>Count</th></tr><tr><td>Ada</td><td>2</td></tr></table><img src="./assets/chart.png" alt="Chart"><script>alert(1)</script>');
    expect(markdown).toContain("# Report");
    expect(markdown).toContain("**bold**");
    expect(markdown).toContain("| Ada | 2 |");
    expect(markdown).toContain("![Chart](./assets/chart.png)");
    expect(markdown).not.toContain("alert(1)");
  });
});

describe("PDF converter", () => {
  it("extracts selectable text and preserves page boundaries", async () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Length 48 >>\nstream\nBT /F1 18 Tf 30 250 Td (PDF import text) Tj ET\nendstream"
    ];
    let source = "%PDF-1.4\n";
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(Buffer.byteLength(source, "binary"));
      source += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(source, "binary");
    source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets.slice(1)) source += String(offset).padStart(10, "0") + " 00000 n \n";
    source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const markdown = await pdfToMarkdown(new Uint8Array(Buffer.from(source, "binary")));
    expect(markdown).toContain("## 第 1 页");
    expect(markdown).toContain("PDF import text");
  });
});

describe("Notion archive converter", () => {
  it("preserves page links and rewrites local image references into WebP assets", async () => {
    const zip = new JSZip();
    const pageId = "a".repeat(32);
    const otherId = "b".repeat(32);
    const imageId = "c".repeat(32);
    zip.file("Export/Start " + pageId + ".md", `---\ntitle: Start\n---\n# Start\n\n[Other](Other ${otherId}.md)\n\n![Chart](chart ${imageId}.png)`);
    zip.file("Export/Other " + otherId + ".md", "# Other");
    zip.file("Export/chart " + imageId + ".png", new Uint8Array([1, 2, 3]));
    zip.file("Export/data.csv", "key,value\na,1");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const result = await notionZipToMarkdown(bytes, "Imported Notion");
    const start = result.files.find(file => file.path.endsWith("/Start.md"));
    expect(result.files).toHaveLength(3);
    expect(start.content).toContain("[Other](./Other.md)");
    expect(start.content).toContain("![Chart](./assets/chart.webp)");
    expect(result.assets[0].path).toBe("Imported Notion/assets/chart.webp");
    expect(result.files.find(file => file.path.endsWith("/data.md")).content).toContain("| a | 1 |");
  });

  it("rejects unsafe paths and removes Notion hash suffixes", () => {
    expect(safeZipPath("../outside.md")).toBe(null);
    expect(safeZipPath("/absolute.md")).toBe(null);
    expect(stripNotionHash("Meeting " + "d".repeat(32) + ".md")).toBe("Meeting.md");
  });
});
