// Ported from morphdraft/src/core/import/converters.ts and notion.ts.
// Heavy parsers are dynamically imported so routine plugin startup stays small.

const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp|bmp|tiff?|svg|avif|heic)$/i;
const MAX_ARCHIVE_ENTRIES = 4000;
const MAX_ARCHIVE_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_ARCHIVE_TOTAL_BYTES = 256 * 1024 * 1024;

function escapeTableCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function rowsToTable(rows) {
  const nonEmpty = (rows || []).filter(row => (row || []).some(cell => String(cell ?? "").trim() !== ""));
  if (!nonEmpty.length) return "";
  const columns = Math.max(...nonEmpty.map(row => row.length));
  const pad = row => Array.from({ length: columns }, (_, index) => escapeTableCell(row[index]));
  const header = pad(nonEmpty[0]);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...nonEmpty.slice(1).map(row => `| ${pad(row).join(" | ")} |`)
  ].join("\n");
}

function parseDelimited(text, delimiter) {
  const source = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const rows = [];
  let row = [];
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

function csvToMarkdown(text, delimiter = ",") {
  return rowsToTable(parseDelimited(text, delimiter));
}

function isFlatRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every(item => item === null || typeof item !== "object");
}

function jsonToMarkdown(text) {
  let parsed;
  try { parsed = JSON.parse(String(text ?? "")); }
  catch (_) { throw new Error("JSON 文件格式无效，未导入"); }
  if (Array.isArray(parsed) && parsed.length && parsed.every(isFlatRecord)) {
    const keys = [...new Set(parsed.flatMap(record => Object.keys(record)))];
    return rowsToTable([keys, ...parsed.map(record => keys.map(key => record[key]))]);
  }
  return "```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
}

async function xlsxToMarkdown(bytes) {
  const loaded = await import("exceljs");
  const ExcelJS = loaded.default?.Workbook ? loaded.default : loaded;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes));
  const sections = [];
  for (const sheet of workbook.worksheets) {
    const rows = [];
    sheet.eachRow({ includeEmpty: false }, row => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(value => {
        if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
        if (!value || typeof value !== "object") return value;
        if (value.result !== undefined) return value.result;
        if (typeof value.text === "string") return value.text;
        if (Array.isArray(value.richText)) return value.richText.map(part => part.text || "").join("");
        if (typeof value.formula === "string") return "=" + value.formula;
        return JSON.stringify(value);
      }));
    });
    const table = rowsToTable(rows);
    if (table) sections.push(`## ${String(sheet.name).replace(/\n/g, " ")}\n\n${table}`);
  }
  if (!sections.length) throw new Error("工作簿中没有可导入的表格数据");
  return sections.join("\n\n");
}

function decodeXml(value) {
  return String(value).replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function safeMarkdownHeading(value) {
  return String(value).replace(/[\r\n]+/g, " ").replace(/[#\\]/g, "\\$&").trim();
}

async function pptxToMarkdown(bytes) {
  const loaded = await import("jszip");
  const JSZip = loaded.default || loaded;
  const archive = await JSZip.loadAsync(bytes);
  const slides = Object.keys(archive.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => Number(left.match(/slide(\d+)\.xml$/)[1]) - Number(right.match(/slide(\d+)\.xml$/)[1]));
  if (!slides.length) throw new Error("PPTX 中没有可读取的幻灯片");
  const sections = [];
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

async function pdfToMarkdown(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableRange: true });
  const pdfDocument = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let baseline = null;
      let line = "";
      let previousX = null;
      for (const item of content.items || []) {
        if (!item || typeof item.str !== "string" || !item.str) continue;
        const y = Number(item.transform?.[5]);
        const x = Number(item.transform?.[4]);
        if (baseline !== null && Number.isFinite(y) && Math.abs(y - baseline) > 2) {
          if (line.trim()) lines.push(line.trim());
          line = "";
          previousX = null;
        }
        if (line && previousX !== null && Number.isFinite(x) && x - previousX > 2 && !/\s$/.test(line) && !/^\s/.test(item.str)) line += " ";
        line += item.str;
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

async function htmlToMarkdown(source) {
  const [turndownModule, gfmModule] = await Promise.all([import("turndown"), import("turndown-plugin-gfm")]);
  const TurndownService = turndownModule.default || turndownModule;
  const service = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  service.use(gfmModule.gfm || gfmModule.default?.gfm);
  service.addRule("images", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = String(node.getAttribute("alt") || "").replace(/\]/g, "\\]");
      const src = String(node.getAttribute("src") || "").replace(/\)/g, "%29");
      return src ? `![${alt}](${src})` : "";
    }
  });
  const contentOnly = String(source ?? "")
    .replace(/<(script|style|noscript|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(?:script|style|noscript|iframe|object|embed)\b[^>]*>/gi, "");
  return service.turndown(contentOnly).replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function stripNotionHash(name) {
  return String(name).replace(/\s+[a-f0-9]{20,}(\.[^.]+)$/i, "$1").replace(/\s+[a-f0-9]{20,}$/i, "");
}

function safePathSegment(segment) {
  const clean = stripNotionHash(segment).replace(/[<>:"|?*\u0000-\u001f]/g, "-").trim().replace(/[. ]+$/g, "");
  if (!clean || clean === "." || clean === "..") return "_";
  return clean.slice(0, 180);
}

function safeZipPath(value) {
  const path = String(value).replace(/\\/g, "/");
  if (!path || path.startsWith("/") || /^[a-z]:/i.test(path)) return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.some(segment => segment === "." || segment === "..")) return null;
  return segments.map(safePathSegment).join("/");
}

function commonZipRoot(paths) {
  if (!paths.length) return "";
  const first = paths.map(path => path.split("/")[0]);
  if (first[0] && first.every(part => part === first[0]) && paths.every(path => path.includes("/"))) return first[0] + "/";
  return "";
}

function cleanRelativeZipPath(value, currentPath) {
  let decoded = decodeEntities(String(value).replace(/^<|>$/g, "")).replace(/\\/g, "/");
  try { decoded = decodeURIComponent(decoded); } catch (_) {}
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

function uniquePath(candidate, occupied) {
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

function relativeMarkdownPath(fromFile, toFile) {
  const from = fromFile.split("/").slice(0, -1);
  const to = toFile.split("/");
  while (from.length && to.length && from[0].toLowerCase() === to[0].toLowerCase()) { from.shift(); to.shift(); }
  const value = [...from.map(() => ".."), ...to].join("/");
  return value.startsWith(".") ? value : "./" + value;
}

function rewriteNotionReferences(markdown, sourcePath, targetPath, rootPrefix, notesBySource, assetsBySource) {
  const resolve = (raw, isImage) => {
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
  markdown = markdown.replace(/(!?\[[^\]]*\]\()(\s*)(<[^>]+>|[^)]*?)(\s+(?:"[^"]*"|'[^']*'))?(\s*\))/g, (whole, prefix, space, raw, title = "", close) => {
    const isImage = prefix.startsWith("![");
    const next = resolve(raw, isImage);
    return next ? prefix + space + next + title + close : whole;
  });
  markdown = markdown.replace(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi, (whole, _quote, raw) => {
    const next = resolve(raw, true);
    return next ? whole.replace(raw, next) : whole;
  });
  return markdown;
}

async function notionZipToMarkdown(bytes, importRoot) {
  const loaded = await import("jszip");
  const JSZip = loaded.default || loaded;
  const archive = await JSZip.loadAsync(bytes);
  const entries = Object.values(archive.files).filter(entry => !entry.dir);
  if (!entries.length) throw new Error("Notion 导出包为空");
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("Notion 导出包文件过多，已停止导入");
  let totalBytes = 0;
  for (const entry of entries) {
    const size = Number(entry._data?.uncompressedSize || 0);
    if (size > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Notion 导出包中有过大的文件：${entry.name}`);
    totalBytes += size;
  }
  if (totalBytes > MAX_ARCHIVE_TOTAL_BYTES) throw new Error("Notion 导出包解压后超过 256 MB，已停止导入");

  const valid = entries.map(entry => ({ entry, sourcePath: safeZipPath(entry.name) })).filter(item => item.sourcePath);
  const prefix = commonZipRoot(valid.map(item => item.sourcePath));
  const prepared = valid.map(item => ({ ...item, relativePath: prefix && item.sourcePath.startsWith(prefix) ? item.sourcePath.slice(prefix.length) : item.sourcePath }));
  const documents = prepared.filter(item => /\.(?:md|csv)$/i.test(item.relativePath));
  if (!documents.length) throw new Error("Notion 导出包里没有 Markdown 或 CSV 页面");
  const media = prepared.filter(item => IMAGE_EXTENSIONS.test(item.relativePath));
  const root = String(importRoot || "Notion 导入").split("/").filter(Boolean).map(safePathSegment).join("/");
  const occupied = new Set();
  const documentRecords = [];
  const noteTargets = new Map();
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

  const assetRecords = [];
  const assetTargets = new Map();
  for (const item of media) {
    const sourceName = item.relativePath.split("/").pop();
    const parent = item.relativePath.includes("/") ? item.relativePath.slice(0, item.relativePath.lastIndexOf("/")) : "";
    const folder = [root, ...parent.split("/").filter(Boolean).map(safePathSegment), "assets"].filter(Boolean).join("/");
    const stem = safePathSegment(stripNotionHash(sourceName).replace(/\.[^.]+$/, "")) || "image";
    const assetPath = uniquePath(`${folder}/${stem}.webp`, occupied);
    assetTargets.set(item.relativePath.toLowerCase(), assetPath);
    assetTargets.set(stripNotionHash(item.relativePath).toLowerCase(), assetPath);
    assetRecords.push({ item, assetPath });
  }

  const assets = [];
  for (const { item, assetPath } of assetRecords) {
    const data = await item.entry.async("uint8array");
    if (data.byteLength > MAX_ARCHIVE_ENTRY_BYTES) throw new Error(`Notion 图片过大：${item.entry.name}`);
    assets.push({ sourcePath: item.relativePath, path: assetPath, bytes: data, extension: item.relativePath.split(".").pop().toLowerCase() });
  }

  const files = [];
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
  pptxToMarkdown,
  pdfToMarkdown,
  htmlToMarkdown,
  stripNotionHash,
  safePathSegment,
  safeZipPath,
  notionZipToMarkdown
};
