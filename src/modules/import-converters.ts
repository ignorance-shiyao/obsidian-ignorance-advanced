// Ported from morphdraft/src/core/import/converters.ts and notion.ts.
// Everything runs in the page: Office files are zip archives of XML read with
// JSZip and DOMParser; PDF text and HTML conversion use the libraries Obsidian
// ships (loadPdfJs, htmlToMarkdown), handed in by the caller.
import JSZip from "jszip";

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|avif|heic)$/i;
const MAX_ARCHIVE_ENTRIES = 4000;
const MAX_ARCHIVE_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 256 * 1024 * 1024;

type Cell = string | number | boolean | null | undefined;
type Row = Cell[];

export interface DocxImage { name: string; extension: string; bytes: Uint8Array }
export interface NotionFile { path: string; content: string }
export interface NotionAsset { sourcePath: string; path: string; bytes: Uint8Array; extension: string }
export interface NotionArchive { files: NotionFile[]; assets: NotionAsset[]; totalCount: number; root: string }

/** The part of PDF.js (Obsidian's loadPdfJs()) this module calls. */
interface PdfTextItem { type?: string; str?: unknown; transform?: number[]; width?: number; hasEOL?: boolean }
interface PdfPage { getTextContent(): Promise<{ items?: PdfTextItem[] }>; cleanup?(): void }
interface PdfDocument { numPages: number; getPage(pageNumber: number): Promise<PdfPage> }
export interface PdfJs {
  getDocument(source: { data: Uint8Array | ArrayBuffer; useSystemFonts: boolean; disableRange: boolean }): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

/** JSZip keeps the uncompressed size on a private field; read it without trusting it. */
interface SizedEntry { _data?: { uncompressedSize?: number } }

type ZipInput = Uint8Array | ArrayBuffer;

// DOMParser documents may come from another realm (tests), so test the node type instead of instanceof.
function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function escapeTableCell(value: Cell): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function rowsToTable(rows: Row[]): string {
  const nonEmpty = (rows || []).filter(row => (row || []).some(cell => String(cell ?? "").trim() !== ""));
  if (!nonEmpty.length) return "";
  const columns = Math.max(...nonEmpty.map(row => row.length));
  const pad = (row: Row) => Array.from({ length: columns }, (_, index) => escapeTableCell(row[index]));
  const header = pad(nonEmpty[0]);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...nonEmpty.slice(1).map(row => `| ${pad(row).join(" | ")} |`)
  ].join("\n");
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const source = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function csvToMarkdown(text: string, delimiter = ",") {
  return rowsToTable(parseDelimited(text, delimiter));
}

function isFlatRecord(value: unknown): value is Record<string, Cell> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every(item => item === null || typeof item !== "object");
}

function jsonToMarkdown(text: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(String(text ?? "")); }
  catch { throw new Error("JSON 文件格式无效，未导入"); }
  if (Array.isArray(parsed) && parsed.length && parsed.every(isFlatRecord)) {
    const keys = [...new Set(parsed.flatMap(record => Object.keys(record)))];
    return rowsToTable([keys, ...parsed.map(record => keys.map(key => record[key]))]);
  }
  return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
}

const XML_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

// Column letters of a cell reference ("AB12" → 27, zero-based).
function columnIndex(reference: string | null): number {
  const letters = /^[A-Z]+/i.exec(String(reference || ""))?.[0].toUpperCase() || "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

async function xlsxToMarkdown(bytes: ZipInput): Promise<string> {
  const archive = await JSZip.loadAsync(bytes);
  const read = async (name: string) => {
    const file = archive.file(name);
    return file ? parseXml(await file.async("string")) : null;
  };
  const shared: string[] = [];
  const strings = await read("xl/sharedStrings.xml");
  for (const item of strings ? Array.from(strings.getElementsByTagNameNS(XML_MAIN, "si")) : []) {
    shared.push(Array.from(item.getElementsByTagNameNS(XML_MAIN, "t")).map(node => node.textContent || "").join(""));
  }
  const workbook = await read("xl/workbook.xml");
  const relations = await read("xl/_rels/workbook.xml.rels");
  const targets = new Map(Array.from(relations?.getElementsByTagName("Relationship") || []).map(rel => [rel.getAttribute("Id"), rel.getAttribute("Target")]));
  const sections: string[] = [];
  for (const sheet of Array.from(workbook?.getElementsByTagNameNS(XML_MAIN, "sheet") || [])) {
    const id = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const target = String((id && targets.get(id)) || "").replace(/^\/?(?:xl\/)?/, "");
    const xml = target ? await read(`xl/${target}`) : null;
    if (!xml) continue;
    const rows: string[][] = [];
    for (const row of Array.from(xml.getElementsByTagNameNS(XML_MAIN, "row"))) {
      const values: string[] = [];
      for (const cell of Array.from(row.getElementsByTagNameNS(XML_MAIN, "c"))) {
        const type = cell.getAttribute("t");
        const value = cell.getElementsByTagNameNS(XML_MAIN, "v")[0]?.textContent ?? "";
        let text = value;
        if (type === "s") text = shared[Number(value)] ?? "";
        else if (type === "inlineStr") text = Array.from(cell.getElementsByTagNameNS(XML_MAIN, "t")).map(node => node.textContent || "").join("");
        else if (type === "b") text = value === "1" ? "TRUE" : "FALSE";
        else if (!value) {
          const formula = cell.getElementsByTagNameNS(XML_MAIN, "f")[0]?.textContent;
          text = formula ? "=" + formula : "";
        }
        values[columnIndex(cell.getAttribute("r"))] = text;
      }
      rows.push(Array.from(values, value => value ?? ""));
    }
    const table = rowsToTable(rows);
    if (table) sections.push(`## ${String(sheet.getAttribute("name") || "").replace(/\n/g, " ")}\n\n${table}`);
  }
  if (!sections.length) throw new Error("工作簿中没有可导入的表格数据");
  return sections.join("\n\n");
}

const XML_WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const XML_RELATIONSHIP = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function wordChildren(node: Node, name: string): Element[] {
  return Array.from(node.childNodes).filter(isElement).filter(child => child.namespaceURI === XML_WORD && child.localName === name);
}

function wordProperty(node: Element, container: string, name: string): string | null {
  const properties = wordChildren(node, container)[0];
  const element = properties ? wordChildren(properties, name)[0] : null;
  return element ? (element.getAttributeNS(XML_WORD, "val") || "") : null;
}

// A toggle such as <w:b/> is on unless its value says otherwise.
function wordToggle(node: Element, name: string): boolean {
  const value = wordProperty(node, "rPr", name);
  return value !== null && !/^(?:0|false|off|none)$/i.test(value);
}

const MONOSPACE = /mono|consol|courier|menlo|code/i;

// A paragraph whose every run is set in a monospace face: one line of code.
function isCodeParagraph(paragraph: Element): boolean {
  const runs = wordChildren(paragraph, "r").filter(run => wordChildren(run, "t").some(text => text.textContent));
  return runs.length > 0 && runs.every(run => {
    const properties = wordChildren(run, "rPr")[0];
    const fonts = properties ? wordChildren(properties, "rFonts")[0] : null;
    return MONOSPACE.test(fonts?.getAttributeNS(XML_WORD, "ascii") || "");
  });
}

function plainParagraphText(paragraph: Element): string {
  return wordChildren(paragraph, "r").flatMap(run => Array.from(run.childNodes).filter(isElement)).map(child => {
    if (child.namespaceURI !== XML_WORD) return "";
    if (child.localName === "t") return child.textContent || "";
    if (child.localName === "tab") return "\t";
    return child.localName === "br" || child.localName === "cr" ? "\n" : "";
  }).join("");
}

/* Word (.docx) to Markdown: headings, bold / italic / strikethrough runs,
   bulleted and numbered lists, tables, links and embedded pictures. Pictures
   are returned as bytes for the caller to save; the Markdown points at
   `media` + their name. */
async function docxToMarkdown(bytes: ZipInput, media = "./assets/"): Promise<{ markdown: string; images: DocxImage[] }> {
  const archive = await JSZip.loadAsync(bytes);
  const documentFile = archive.file("word/document.xml");
  if (!documentFile) throw new Error("不是有效的 Word 文档");
  const document = parseXml(await documentFile.async("string"));
  const relationsFile = archive.file("word/_rels/document.xml.rels");
  const relations = relationsFile ? parseXml(await relationsFile.async("string")) : null;
  const targets = new Map(Array.from(relations?.getElementsByTagName("Relationship") || []).map(rel => [rel.getAttribute("Id"), rel.getAttribute("Target") || ""]));
  const numberingFile = archive.file("word/numbering.xml");
  const numbering = numberingFile ? parseXml(await numberingFile.async("string")) : null;
  const orderedLists = new Set<string | null>();
  if (numbering) {
    const abstractOrdered = new Set<string | null>();
    for (const abstract of Array.from(numbering.getElementsByTagNameNS(XML_WORD, "abstractNum"))) {
      const format = abstract.getElementsByTagNameNS(XML_WORD, "numFmt")[0]?.getAttributeNS(XML_WORD, "val");
      if (format && format !== "bullet") abstractOrdered.add(abstract.getAttributeNS(XML_WORD, "abstractNumId"));
    }
    for (const num of Array.from(numbering.getElementsByTagNameNS(XML_WORD, "num"))) {
      const abstractId = num.getElementsByTagNameNS(XML_WORD, "abstractNumId")[0]?.getAttributeNS(XML_WORD, "val");
      if (abstractOrdered.has(abstractId)) orderedLists.add(num.getAttributeNS(XML_WORD, "numId"));
    }
  }
  const images: DocxImage[] = [];
  const imageNames = new Map<string, string>();
  const imageFor = async (id: string | null) => {
    if (!id) return null;
    const known = imageNames.get(id);
    if (known) return known;
    const target = targets.get(id);
    const file = target ? archive.file(`word/${target.replace(/^\/?(?:word\/)?/, "")}`) : null;
    if (!file || !target) return null;
    const extension = (target.split(".").pop() || "png").toLowerCase();
    const name = `image-${images.length + 1}.${extension}`;
    images.push({ name, extension, bytes: await file.async("uint8array") });
    imageNames.set(id, name);
    return name;
  };

  const runText = async (run: Element) => {
    let text = "";
    for (const child of Array.from(run.childNodes).filter(isElement)) {
      if (child.namespaceURI === XML_WORD && child.localName === "t") text += child.textContent || "";
      else if (child.namespaceURI === XML_WORD && child.localName === "tab") text += "\t";
      else if (child.namespaceURI === XML_WORD && (child.localName === "br" || child.localName === "cr")) text += "  \n";
      else if (child.namespaceURI === XML_WORD && child.localName === "drawing") {
        const blip = child.getElementsByTagNameNS(XML_DRAWING, "blip")[0];
        const name = blip ? await imageFor(blip.getAttributeNS(XML_RELATIONSHIP, "embed")) : null;
        if (name) text += `![](${media}${name})`;
      }
    }
    if (!text.trim() || text.startsWith("![")) return text;
    const escaped = text.replace(/([*_`[\]])/g, "\\$1");
    const wrap = (value: string, mark: string) => value.replace(/^(\s*)([\s\S]*?)(\s*)$/, `$1${mark}$2${mark}$3`);
    let styled = escaped;
    if (wordToggle(run, "strike")) styled = wrap(styled, "~~");
    if (wordToggle(run, "i")) styled = wrap(styled, "*");
    if (wordToggle(run, "b")) styled = wrap(styled, "**");
    return styled;
  };

  const paragraphText = async (paragraph: Element) => {
    let text = "";
    for (const child of Array.from(paragraph.childNodes).filter(isElement)) {
      if (child.namespaceURI !== XML_WORD) continue;
      if (child.localName === "r") text += await runText(child);
      else if (child.localName === "hyperlink") {
        let label = "";
        for (const run of wordChildren(child, "r")) label += await runText(run);
        const target = targets.get(child.getAttributeNS(XML_RELATIONSHIP, "id") || "");
        text += target && label.trim() ? `[${label}](${target})` : label;
      }
    }
    return text;
  };

  const blocks: Array<{ text: string; list?: boolean }> = [];
  const counters = new Map<string, number>();
  let code: Array<{ text: string; label: boolean }> | null = null;
  const closeCode = () => {
    if (!code) return;
    // A short bold first line is the language label the exporter writes.
    const [first, ...rest] = code;
    const label = first.label && rest.length ? first.text.trim() : "";
    const lines = (label ? rest : code).map(line => line.text);
    blocks.push({ text: "```" + label + "\n" + lines.join("\n") + "\n```" });
    code = null;
  };
  for (const node of Array.from(document.getElementsByTagNameNS(XML_WORD, "body")[0]?.childNodes || []).filter(isElement)) {
    if (node.namespaceURI !== XML_WORD) continue;
    if (node.localName === "p" && isCodeParagraph(node)) {
      const runs = wordChildren(node, "r");
      const text = plainParagraphText(node);
      code ||= [];
      code.push({ text, label: code.length === 0 && /^[\w+#.-]{1,20}$/.test(text.trim()) && runs.every(run => wordToggle(run, "b")) });
      continue;
    }
    closeCode();
    if (node.localName === "tbl") {
      const rows: string[][] = [];
      for (const row of wordChildren(node, "tr")) {
        const cells: string[] = [];
        for (const cell of wordChildren(row, "tc")) {
          const parts: string[] = [];
          for (const paragraph of wordChildren(cell, "p")) parts.push((await paragraphText(paragraph)).trim());
          cells.push(parts.filter(Boolean).join(" "));
        }
        rows.push(cells);
      }
      const table = rowsToTable(rows);
      if (table) blocks.push({ text: table });
      continue;
    }
    if (node.localName !== "p") continue;
    const text = (await paragraphText(node)).trim();
    if (!text) continue;
    const style = String(wordProperty(node, "pPr", "pStyle") || "");
    const heading: ArrayLike<string> | null = /^(?:heading|标题)\s*(\d)$/i.exec(style) || (/^title$/i.test(style) ? [style, "1"] : null);
    const properties = wordChildren(node, "pPr")[0];
    const list = properties ? wordChildren(properties, "numPr")[0] : null;
    if (heading) blocks.push({ text: `${"#".repeat(Math.min(6, Number(heading[1]) || 1))} ${text.replace(/^\*\*([\s\S]*)\*\*$/, "$1")}` });
    else if (list) {
      const level = Number(wordChildren(list, "ilvl")[0]?.getAttributeNS(XML_WORD, "val") || 0);
      const numId = wordChildren(list, "numId")[0]?.getAttributeNS(XML_WORD, "val") || "";
      const key = `${numId}:${level}`;
      counters.set(key, (counters.get(key) || 0) + 1);
      const marker = orderedLists.has(numId) ? `${counters.get(key) ?? 1}.` : "-";
      blocks.push({ text: `${"    ".repeat(level)}${marker} ${text}`, list: true });
    } else if (/quote/i.test(style)) blocks.push({ text: `> ${text}` });
    else blocks.push({ text });
  }
  closeCode();
  const markdown = blocks.map((block, index) => index && !(block.list && blocks[index - 1].list) ? `\n${block.text}` : block.text).join("\n").trim();
  return { markdown, images };
}

function decodeXml(value: string): string {
  return String(value).replace(/&#x([\da-f]+);/gi, (_: string, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_: string, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function slideNumber(name: string): number {
  return Number(/slide(\d+)\.xml$/.exec(name)?.[1]);
}

async function pptxToMarkdown(bytes: ZipInput): Promise<string> {
  const archive = await JSZip.loadAsync(bytes);
  const slides = Object.keys(archive.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => slideNumber(left) - slideNumber(right));
  if (!slides.length) throw new Error("PPTX 中没有可读取的幻灯片");
  const sections: string[] = [];
  for (let index = 0; index < slides.length; index += 1) {
    const xml = await archive.files[slides[index]].async("string");
    const paragraphs = [...xml.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)].map(match => {
      const text = [...match[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
        .map(item => decodeXml(item[1])).join("").trim();
      return text;
    }).filter(Boolean);
    const body = paragraphs.join("\n\n") || "（本页无可提取文本）";
    sections.push(`## 第 ${index + 1} 页\n\n${body}`);
  }
  return sections.join("\n\n---\n\n");
}

// pdfjs: the PDF.js library (Obsidian's, from loadPdfJs()).
async function pdfToMarkdown(bytes: Uint8Array | ArrayBuffer, pdfjs: PdfJs): Promise<string> {
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableRange: true });
  const pdfDocument = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let baseline: number | null = null;
      let line = "";
      let previousX: number | null = null;
      for (const item of content.items || []) {
        if (!item || typeof item.str !== "string" || !item.str) continue;
        const str = item.str;
        const y = Number(item.transform?.[5]);
        const x = Number(item.transform?.[4]);
        if (baseline !== null && Number.isFinite(y) && Math.abs(y - baseline) > 2) {
          if (line.trim()) lines.push(line.trim());
          line = "";
          previousX = null;
        }
        if (line && previousX !== null && Number.isFinite(x) && x - previousX > 2 && !/\s$/.test(line) && !/^\s/.test(str)) line += " ";
        line += str;
        baseline = Number.isFinite(y) ? y : baseline;
        previousX = Number.isFinite(x) ? x + Number(item.width || 0) : previousX;
        if (item.hasEOL) {
          if (line.trim()) lines.push(line.trim());
          line = "";
          baseline = null;
          previousX = null;
        }
      }
      if (line.trim()) lines.push(line.trim());
      const body = lines.filter(Boolean).join("\n\n");
      pages.push(`## 第 ${pageNumber} 页\n\n${body || "（本页无可提取文本）"}`);
      page.cleanup?.();
    }
  } finally {
    await loadingTask.destroy();
  }
  const markdown = pages.join("\n\n---\n\n").trim();
  if (!markdown || pages.every(page => page.endsWith("（本页无可提取文本）"))) {
    throw new Error("PDF 没有可提取的文本；扫描版 PDF 暂不支持 OCR");
  }
  return markdown;
}

// convert: an HTML-to-Markdown function (Obsidian's htmlToMarkdown).
async function htmlToMarkdown(source: string, convert: (html: string) => string | Promise<string>): Promise<string> {
  const contentOnly = String(source ?? "")
    .replace(/<(script|style|noscript|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(?:script|style|noscript|iframe|object|embed)\b[^>]*>/gi, "");
  return String(await convert(contentOnly)).replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(value: string): string {
  return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function stripNotionHash(name: string): string {
  return String(name).replace(/\s+[a-f0-9]{20,}(\.[^.]+)$/i, "$1").replace(/\s+[a-f0-9]{20,}$/i, "");
}

function safePathSegment(segment: string): string {
  const clean = Array.from(stripNotionHash(segment), char => char.charCodeAt(0) < 32 || "<>:\"|?*".includes(char) ? "-" : char).join("").trim().replace(/[. ]+$/g, "");
  if (!clean || clean === "." || clean === "..") return "_";
  return clean.slice(0, 180);
}

function safeZipPath(value: string): string | null {
  const path = String(value).replace(/\\/g, "/");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path)) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.some(segment => segment === "." || segment === "..")) return null;
  return segments.map(safePathSegment).join("/");
}

function commonZipRoot(paths: string[]): string {
  if (!paths.length) return "";
  const first = paths.map(path => path.split("/")[0]);
  if (first[0] && first.every(part => part === first[0]) && paths.every(path => path.includes("/"))) return first[0] + "/";
  return "";
}

function cleanRelativeZipPath(value: string, currentPath: string): string | null {
  let decoded = decodeEntities(String(value).replace(/^<|>$/g, "")).replace(/\\/g, "/");
  try { decoded = decodeURIComponent(decoded); } catch { /* keep the undecoded path */ }
  decoded = decoded.split(/[?#]/, 1)[0];
  if (!decoded || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(decoded)) return null;
  const stack = currentPath.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") { if (!stack.length) return null; stack.pop(); }
    else stack.push(segment);
  }
  return stack.join("/");
}

function uniquePath(candidate: string, occupied: Set<string>): string {
  if (!occupied.has(candidate.toLowerCase())) { occupied.add(candidate.toLowerCase()); return candidate; }
  const slash = candidate.lastIndexOf("/");
  const dir = slash >= 0 ? candidate.slice(0, slash + 1) : "";
  const leaf = slash >= 0 ? candidate.slice(slash + 1) : candidate;
  const dot = leaf.lastIndexOf(".");
  const stem = dot > 0 ? leaf.slice(0, dot) : leaf;
  const extension = dot > 0 ? leaf.slice(dot) : "";
  for (let index = 2; ; index += 1) {
    const next = `${dir}${stem}-${index}${extension}`;
    if (!occupied.has(next.toLowerCase())) { occupied.add(next.toLowerCase()); return next; }
  }
}

function relativeMarkdownPath(fromFile: string, toFile: string): string {
  const from = fromFile.split("/").slice(0, -1);
  const to = toFile.split("/");
  while (from.length && to.length && from[0].toLowerCase() === to[0].toLowerCase()) { from.shift(); to.shift(); }
  const value = [...from.map(() => ".."), ...to].join("/");
  return value.startsWith(".") ? value : "./" + value;
}

function rewriteNotionReferences(markdown: string, sourcePath: string, targetPath: string, rootPrefix: string, notesBySource: Map<string, string>, assetsBySource: Map<string, string>): string {
  const resolve = (raw: string, isImage: boolean) => {
    const original = raw.replace(/^<|>$/g, "");
    const fragmentIndex = original.indexOf("#");
    const fragment = fragmentIndex >= 0 ? original.slice(fragmentIndex) : "";
    const resolved = cleanRelativeZipPath(original, sourcePath);
    if (!resolved) return null;
    const withoutRoot = rootPrefix && resolved.startsWith(rootPrefix) ? resolved.slice(rootPrefix.length) : resolved;
    const normalized = withoutRoot.split("/").map(safePathSegment).join("/").toLowerCase();
    const target = isImage ? assetsBySource.get(normalized) : notesBySource.get(normalized);
    if (!target) return null;
    return relativeMarkdownPath(targetPath, target) + (isImage ? "" : fragment);
  };
  markdown = markdown.replace(/(!?\[[^\]]*\]\()(\s*)(<[^>]+>|[^)]*?)(\s+(?:"[^"]*"|'[^']*'))?(\s*\))/g, (whole: string, prefix: string, space: string, raw: string, title: string | undefined, close: string) => {
    const isImage = prefix.startsWith("![");
    const next = resolve(raw, isImage);
    return next ? prefix + space + next + (title ?? "") + close : whole;
  });
  markdown = markdown.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi, (whole: string, _quote: string, raw: string) => {
    const next = resolve(raw, true);
    return next ? whole.replace(raw, next) : whole;
  });
  return markdown;
}

async function notionZipToMarkdown(bytes: ZipInput, importRoot: string): Promise<NotionArchive> {
  const archive = await JSZip.loadAsync(bytes);
  const entries = Object.values(archive.files).filter(entry => !entry.dir);
  if (!entries.length) throw new Error("Notion 导出包为空");
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("Notion 导出包文件过多，已停止导入");
  let totalBytes = 0;
  for (const entry of entries) {
    const size = Number((entry as JSZip.JSZipObject & SizedEntry)._data?.uncompressedSize || 0);
    if (size > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Notion 导出包中有过大的文件：${entry.name}`);
    totalBytes += size;
  }
  if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) throw new Error("Notion 导出包解压后超过 256 MB，已停止导入");

  const valid = entries.flatMap(entry => {
    const sourcePath = safeZipPath(entry.name);
    return sourcePath ? [{ entry, sourcePath }] : [];
  });
  const prefix = commonZipRoot(valid.map(item => item.sourcePath));
  const prepared = valid.map(item => ({ ...item, relativePath: prefix && item.sourcePath.startsWith(prefix) ? item.sourcePath.slice(prefix.length) : item.sourcePath }));
  const documents = prepared.filter(item => /\.(?:md|csv)$/i.test(item.relativePath));
  if (!documents.length) throw new Error("Notion 导出包里没有 Markdown 或 CSV 页面");
  const media = prepared.filter(item => IMAGE_EXTENSIONS.test(item.relativePath));
  const root = String(importRoot || "Notion 导入").split("/").filter(Boolean).map(safePathSegment).join("/");
  const occupied = new Set<string>();
  const documentRecords: Array<{ item: typeof prepared[number]; targetPath: string }> = [];
  const noteTargets = new Map<string, string>();
  for (const item of documents) {
    const originalRelative = item.relativePath;
    let clean = originalRelative.split("/").map(safePathSegment).join("/");
    if (/\.csv$/i.test(clean)) clean = clean.replace(/\.csv$/i, ".md");
    const targetPath = uniquePath(`${root}/${clean}`, occupied);
    const key = originalRelative.toLowerCase();
    noteTargets.set(key, targetPath);
    noteTargets.set(stripNotionHash(originalRelative).toLowerCase(), targetPath);
    documentRecords.push({ item, targetPath });
  }

  const assetRecords: Array<{ item: typeof prepared[number]; assetPath: string }> = [];
  const assetTargets = new Map<string, string>();
  for (const item of media) {
    const sourceName = item.relativePath.split("/").pop() || "";
    const parent = item.relativePath.includes("/") ? item.relativePath.slice(0, item.relativePath.lastIndexOf("/")) : "";
    const folder = [root, ...parent.split("/").filter(Boolean).map(safePathSegment), "assets"].filter(Boolean).join("/");
    const stem = safePathSegment(stripNotionHash(sourceName).replace(/\.[^.]+$/, "")) || "image";
    const assetPath = uniquePath(`${folder}/${stem}.webp`, occupied);
    assetTargets.set(item.relativePath.toLowerCase(), assetPath);
    assetTargets.set(stripNotionHash(item.relativePath).toLowerCase(), assetPath);
    assetRecords.push({ item, assetPath });
  }

  const assets: NotionAsset[] = [];
  for (const { item, assetPath } of assetRecords) {
    const data = await item.entry.async("uint8array");
    if (data.byteLength > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Notion 图片过大：${item.entry.name}`);
    assets.push({ sourcePath: item.relativePath, path: assetPath, bytes: data, extension: (item.relativePath.split(".").pop() || "").toLowerCase() });
  }

  const files: NotionFile[] = [];
  for (const { item, targetPath } of documentRecords) {
    let content = await item.entry.async("string");
    if (/\.csv$/i.test(item.relativePath)) content = csvToMarkdown(content);
    else content = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
    content = rewriteNotionReferences(content, item.relativePath, targetPath, prefix, noteTargets, assetTargets);
    files.push({ path: targetPath, content: content.replace(/\n{3,}/g, "\n\n").trim() });
  }
  return { files, assets, totalCount: files.length, root };
}

export {
  IMAGE_EXTENSIONS,
  rowsToTable,
  parseDelimited,
  csvToMarkdown,
  jsonToMarkdown,
  xlsxToMarkdown,
  docxToMarkdown,
  pptxToMarkdown,
  pdfToMarkdown,
  htmlToMarkdown,
  stripNotionHash,
  safePathSegment,
  safeZipPath,
  notionZipToMarkdown
};
