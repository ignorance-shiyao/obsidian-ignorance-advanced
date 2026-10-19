import JSZip from "jszip";
/* Packs rendered chapters into an ePub 3 file: mimetype stored first, container, package document, a navigation
   document (table of contents) and one XHTML file per chapter. Pure packaging, no Obsidian API. */
export interface EpubChapter { title: string; body: string }
export interface EpubImage { name: string; mime: string; data: Uint8Array }
export interface EpubMeta { title: string; author: string; language: string; id: string; date: string }

export const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const chapterFile = (index: number) => `ch-${String(index + 1).padStart(2, "0")}.xhtml`;

const STYLE = "body{font-family:serif;line-height:1.7;margin:5%}img,svg{max-width:100%;height:auto}pre,code{font-family:monospace;white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #888;padding:.2em .5em}blockquote{margin-left:1em;padding-left:.8em;border-left:3px solid #888}";

function page(title: string, language: string, body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(language)}" xml:lang="${escapeXml(language)}"><head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body>${body}</body></html>`;
}

export function navDocument(meta: EpubMeta, chapters: EpubChapter[]) {
  const items = chapters.map((chapter, index) => `<li><a href="${chapterFile(index)}">${escapeXml(chapter.title)}</a></li>`).join("");
  return page(meta.title, meta.language, `<nav epub:type="toc" id="toc"><h1>${escapeXml(meta.title)}</h1><ol>${items}</ol></nav>`);
}

// Chapters with inline SVG or MathML must say so in the package document, or readers may refuse them.
export function itemProperties(body: string): string {
  const found = [/<svg[\s>/]/.test(body) ? "svg" : "", /<math[\s>/]/.test(body) ? "mathml" : ""].filter(Boolean);
  return found.length ? ` properties="${found.join(" ")}"` : "";
}

export function packageDocument(meta: EpubMeta, chapters: EpubChapter[], images: EpubImage[]) {
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map((chapter, index) => `<item id="c${index + 1}" href="${chapterFile(index)}" media-type="application/xhtml+xml"${itemProperties(chapter.body)}/>`),
    ...images.map((image, index) => `<item id="i${index + 1}" href="images/${escapeXml(image.name)}" media-type="${image.mime}"/>`)
  ].join("");
  const spine = chapters.map((_, index) => `<itemref idref="c${index + 1}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">${escapeXml(meta.id)}</dc:identifier><dc:title>${escapeXml(meta.title)}</dc:title><dc:language>${escapeXml(meta.language)}</dc:language>${meta.author ? `<dc:creator>${escapeXml(meta.author)}</dc:creator>` : ""}<meta property="dcterms:modified">${escapeXml(meta.date)}</meta></metadata><manifest>${manifest}</manifest><spine>${spine}</spine></package>`;
}

export async function buildEpub(meta: EpubMeta, chapters: EpubChapter[], images: EpubImage[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const plain = { createFolders: false };
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>', plain);
  zip.file("OEBPS/content.opf", packageDocument(meta, chapters, images), plain);
  zip.file("OEBPS/nav.xhtml", navDocument(meta, chapters), plain);
  zip.file("OEBPS/style.css", STYLE, plain);
  chapters.forEach((chapter, index) => zip.file(`OEBPS/${chapterFile(index)}`, page(chapter.title, meta.language, chapter.body), plain));
  for (const image of images) zip.file(`OEBPS/images/${image.name}`, image.data, plain);
  return zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip", compression: "DEFLATE" });
}

// One note per line: `[[名称]]`, `[[名称|别名]]`, `名称` or `名称.md`; blank lines and repeats are dropped.
export function parseNoteList(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/^[-*\d.\s]+(?=\[\[)/, "").replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim().replace(/\.md$/i, "");
    if (name) seen.add(name);
  }
  return [...seen];
}

export function imageMime(extension: string): string | null {
  const map: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
  return map[extension.toLowerCase()] ?? null;
}

// The notes as one Markdown text for Word: front matter removed, one note after the other in the chosen order.
export function combineMarkdown(texts: string[]): string {
  return texts.map(text => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim()).filter(Boolean).join("\n\n");
}

/* Rewrites one note's local links and embeds to full vault paths before notes are merged, so each note's
   `assets/x.png` still means its own folder's file. `resolve` gets the link target (no #heading) and returns the
   vault path, or null to leave the link as written. Web links, in-note anchors and code are left alone. */
export function absolutizeLinks(text: string, resolve: (target: string) => string | null): string {
  const fix = (raw: string, wrap: (path: string, rest: string) => string) => {
    const cut = raw.search(/[#^]/), target = cut < 0 ? raw : raw.slice(0, cut), rest = cut < 0 ? "" : raw.slice(cut);
    if (!target.trim() || /^[a-z][\w+.-]*:/i.test(target)) return null;
    let decoded = target;
    try { decoded = decodeURIComponent(target); } catch { /* keep as written */ }
    const path = resolve(decoded.trim());
    return path ? wrap(path, rest) : null;
  };
  const line = (part: string) => part
    .replace(/(!?)\[\[([^\]|\n]+)((?:\|[^\]\n]*)?)\]\]/g, (all, bang: string, raw: string, alias: string) =>
      fix(raw, (path, rest) => `${bang}[[${path}${rest}${alias}]]`) ?? all)
    .replace(/(!?\[[^\]\n]*\])\((<[^>\n]+>|[^)\s]+)((?:\s+"[^"\n]*")?)\)/g, (all, label: string, raw: string, title: string) =>
      fix(raw.replace(/^<|>$/g, ""), (path, rest) => `${label}(${path.replace(/[ ()%]/g, encodeURIComponent)}${rest}${title})`) ?? all);
  let fence = "";
  return text.split("\n").map(row => {
    const mark = /^\s*(`{3,}|~{3,})/.exec(row)?.[1];
    if (fence) { if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = ""; return row; }
    if (mark) { fence = mark; return row; }
    return row.split(/(`+[^`]*`+)/).map((part, i) => i % 2 ? part : line(part)).join("");
  }).join("\n");
}

/** A BCP 47 tag in the usual casing (`zh-cn` → `zh-CN`), or null when the text is not a language tag. */
export function normalizeLanguage(tag: string): string | null {
  const parts = tag.trim().replace(/_/g, "-").split("-");
  if (!/^[a-z]{2,3}$/i.test(parts[0] ?? "") || parts.slice(1).some(part => !/^[a-z0-9]{2,8}$/i.test(part))) return null;
  return [parts[0].toLowerCase(), ...parts.slice(1).map(part => part.length === 2 ? part.toUpperCase() : part.length === 4 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part.toLowerCase())].join("-");
}
