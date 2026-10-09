// 移植自 morphdraft/src/core/export/docx2.ts：Markdown token → docx.js 对象。
import MarkdownIt from "markdown-it";
import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Paragraph,
  Packer,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6
};

const DEFAULT_WORD_STYLE = {
  fontFamily: "Arial",
  headingFamily: "Arial",
  codeFamily: "Consolas",
  fontSize: 11,
  lineHeight: 1.6
};

function stripFrontmatter(source) {
  return source.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
}

function markdownForStructuredWord(source) {
  source = stripFrontmatter(source);
  const lines = source.split(/\r?\n/);
  const result = [];
  let fence = null;
  for (const line of lines) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (!fence && marker) fence = marker[1][0];
    else if (fence && marker && marker[1][0] === fence) fence = null;
    if (!fence && /^\s*:::/u.test(line)) continue;
    result.push(fence ? line : flattenInlineComponents(line));
  }
  return result.join("\n");
}

function flattenInlineComponents(source) {
  return source
    .replace(/\(\((?:green|red|amber|blue|purple|teal|gray|grey):([^()]*)\)\)/gi, "$1")
    .replace(/\(\(bar:(\d+(?:\.\d+)?)\)\)/gi, "$1%")
    .replace(/\(\(spark:([^()]*)\)\)/gi, "趋势：$1");
}

function imageDimensions(data, type) {
  // Plain byte views, so this also runs on mobile where Node's Buffer is absent.
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "png" && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (type === "gif" && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (type === "bmp" && bytes.length >= 26) return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  if (type !== "jpg" || bytes.length < 4) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    }
    if (length < 2) break;
    offset += length + 2;
  }
  return null;
}

function fitImage(image, maxWidth = 468, maxHeight = 640) {
  const dimensions = imageDimensions(image.data, image.type);
  const width = Math.max(1, dimensions?.width || maxWidth);
  const height = Math.max(1, dimensions?.height || Math.round(maxWidth * 0.62));
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function runStyle(style, tpl) {
  return {
    font: style.code ? tpl.codeFamily : tpl.fontFamily,
    size: style.code ? 20 : tpl.fontSize * 2,
    bold: Boolean(style.bold),
    italics: Boolean(style.italics),
    strike: Boolean(style.strike),
    superScript: Boolean(style.superScript),
    subScript: Boolean(style.subScript)
  };
}

async function inlineTokensToRuns(tokens, context, inherited = {}) {
  const runs = [];
  const stack = [{ ...inherited }];
  const current = () => stack[stack.length - 1];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const type = token.type;
    if (["strong_open", "em_open", "s_open", "sup_open", "sub_open", "code_inline"].includes(type)) {
      const next = { ...current() };
      if (type === "strong_open") next.bold = true;
      if (type === "em_open") next.italics = true;
      if (type === "s_open") next.strike = true;
      if (type === "sup_open") next.superScript = true;
      if (type === "sub_open") next.subScript = true;
      if (type === "code_inline") next.code = true;
      stack.push(next);
      if (type === "code_inline") {
        runs.push(new TextRun({ text: token.content || "", ...runStyle(current(), context.style) }));
        stack.pop();
      }
      continue;
    }
    if (["strong_close", "em_close", "s_close", "sup_close", "sub_close"].includes(type)) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (type === "text") {
      runs.push(new TextRun({ text: token.content || "", ...runStyle(current(), context.style) }));
      continue;
    }
    if (type === "softbreak" || type === "hardbreak") {
      runs.push(new TextRun({ break: 1, ...runStyle(current(), context.style) }));
      continue;
    }
    if (type === "image") {
      const src = token.attrGet("src") || "";
      const image = await context.resolveImage?.(src);
      if (!image) {
        runs.push(new TextRun({ text: token.content || "[图片]", ...runStyle(current(), context.style) }));
        continue;
      }
      const transformation = fitImage(image);
      runs.push(new ImageRun({
        type: image.type,
        data: image.data,
        transformation,
        altText: { title: token.content || "图片", description: token.content || "" }
      }));
      continue;
    }
    if (type === "link_open") {
      let depth = 1;
      let end = index + 1;
      while (end < tokens.length && depth > 0) {
        if (tokens[end].type === "link_open") depth += 1;
        if (tokens[end].type === "link_close") depth -= 1;
        end += 1;
      }
      const children = tokens.slice(index + 1, Math.max(index + 1, end - 1));
      const linkRuns = await inlineTokensToRuns(children, context, current());
      const href = token.attrGet("href") || "";
      if (/^(?:https?:\/\/|mailto:)/i.test(href) && linkRuns.length) {
        runs.push(new ExternalHyperlink({ children: linkRuns, link: href }));
      } else {
        runs.push(...linkRuns);
      }
      index = end - 1;
    }
  }

  return runs.length ? runs : [new TextRun({ text: "", ...runStyle(current(), context.style) })];
}

function paragraphFromRuns(runs, context, options = {}) {
  const indent = options.indent ?? context.indent ?? (options.quote ? 720 : 0);
  const paragraphOptions = {
    children: runs,
    spacing: { line: Math.round(context.style.lineHeight * 240), after: 100 },
    autoSpaceEastAsianText: true,
    ...(indent ? { indent: { left: indent } } : {})
  };
  if (options.heading) {
    paragraphOptions.heading = HEADING_LEVELS[options.heading];
    paragraphOptions.spacing = { before: options.heading === 1 ? 280 : 180, after: 100 };
  }
  if (options.quote) {
    paragraphOptions.border = { left: { style: BorderStyle.SINGLE, size: 8, color: "AAB3C2", space: 6 } };
  }
  if (options.code) {
    paragraphOptions.shading = { fill: "F3F5F8" };
    paragraphOptions.indent = { left: indent + 180 };
    paragraphOptions.spacing = { line: 240, before: 20, after: 20 };
  }
  return new Paragraph(paragraphOptions);
}

async function listToDocx(tokens, start, context, depth = 0) {
  const ordered = tokens[start].type === "ordered_list_open";
  const first = Number(tokens[start].attrGet?.("start") || 1);
  const output = [];
  let itemNumber = first;
  let index = start + 1;

  while (index < tokens.length && tokens[index].type !== (ordered ? "ordered_list_close" : "bullet_list_close")) {
    const token = tokens[index];
    if (token.type === "list_item_open") {
      index += 1;
      let itemHasParagraph = false;
      while (index < tokens.length && tokens[index].type !== "list_item_close") {
        const child = tokens[index];
        if (child.type === "paragraph_open") {
          const inline = tokens[index + 1];
          const runs = inline?.children ? await inlineTokensToRuns(inline.children, context) : [new TextRun({ text: "" })];
          if (!itemHasParagraph) {
            runs.unshift(new TextRun({ text: ordered ? `${itemNumber}. ` : "• ", bold: true, font: context.style.fontFamily, size: context.style.fontSize * 2 }));
            output.push(paragraphFromRuns(runs, context, { indent: 360 + depth * 360 }));
            itemHasParagraph = true;
            itemNumber += 1;
          } else {
            output.push(paragraphFromRuns(runs, context, { indent: 540 + depth * 360 }));
          }
          index += 3;
        } else if (child.type === "bullet_list_open" || child.type === "ordered_list_open") {
          const nested = await listToDocx(tokens, index, context, depth + 1);
          output.push(...nested.elements);
          index = nested.next;
        } else if (child.type === "fence" || child.type === "code_block") {
          output.push(...codeBlockParagraphs(child.content || "", context, 540 + depth * 360));
          index += 1;
        } else {
          index += 1;
        }
      }
      index += 1;
    } else {
      index += 1;
    }
  }

  return { elements: output, next: index + 1 };
}

function codeBlockParagraphs(source, context, indent = 0) {
  const lines = source.replace(/\n$/, "").split("\n");
  return (lines.length ? lines : [""]).map(line => paragraphFromRuns([
    new TextRun({ text: line || " ", font: context.style.codeFamily, size: 18 })
  ], context, { code: true, indent }));
}

function tableCells(tokens, start, context, isHeader, count) {
  const rows = [];
  let index = start + 1;
  while (index < tokens.length && tokens[index].type !== "tr_close") {
    const token = tokens[index];
    if (token.type === "th_open" || token.type === "td_open") {
      const inline = tokens[index + 1];
      rows.push({ token, inline, isHeader });
      index += 3;
    } else {
      index += 1;
    }
  }
  const cells = rows.map(async ({ token, inline, isHeader: header }) => {
    const runs = inline?.children ? await inlineTokensToRuns(inline.children, context, header ? { bold: true } : {}) : [new TextRun({ text: "" })];
    const align = token.attrGet?.("style")?.match(/text-align\s*:\s*(left|center|right)/i)?.[1];
    return new TableCell({
      width: { size: 100 / Math.max(1, count), type: WidthType.PERCENTAGE },
      children: [new Paragraph({ children: runs, alignment: align === "center" ? "center" : align === "right" ? "right" : "left", autoSpaceEastAsianText: true })],
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      ...(header ? { shading: { fill: "E9EDF4" } } : {})
    });
  });
  return { cells: Promise.all(cells), next: index + 1 };
}

async function tableToDocx(tokens, start, context) {
  const rows = [];
  let columnCount = 0;
  for (let cursor = start + 1; cursor < tokens.length && tokens[cursor].type !== "table_close"; cursor += 1) {
    if (tokens[cursor].type !== "tr_open") continue;
    let count = 0;
    for (let cell = cursor + 1; cell < tokens.length && tokens[cell].type !== "tr_close"; cell += 1) {
      if (tokens[cell].type === "th_open" || tokens[cell].type === "td_open") count += 1;
    }
    columnCount = Math.max(columnCount, count);
  }
  let index = start + 1;
  let inHeader = false;
  while (index < tokens.length && tokens[index].type !== "table_close") {
    if (tokens[index].type === "thead_open") { inHeader = true; index += 1; continue; }
    if (tokens[index].type === "thead_close") { inHeader = false; index += 1; continue; }
    if (tokens[index].type === "tr_open") {
      const parsed = tableCells(tokens, index, context, inHeader, columnCount);
      const cells = await parsed.cells;
      rows.push(new TableRow({ children: cells, tableHeader: inHeader, cantSplit: true }));
      index = parsed.next;
      continue;
    }
    index += 1;
  }
  if (columnCount > 0) {
    // Markdown tables have a stable column count; normalize ragged rows before creating the table.
    for (const row of rows) {
      while (row.CellCount < columnCount) row.addCellToIndex(new TableCell({ children: [new Paragraph({ text: "" })] }), row.CellCount);
    }
  }
  return { element: rows.length ? new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: columnCount ? Array(columnCount).fill(Math.floor(9360 / columnCount)) : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D4DAE3" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D4DAE3" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D4DAE3" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D4DAE3" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E4E8EE" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "E4E8EE" }
    }
  }) : null, next: index + 1 };
}

async function blocksToDocx(tokens, context, quoteDepth = 0) {
  const elements = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === "heading_open") {
      const inline = tokens[index + 1];
      const level = Number(token.tag?.slice(1)) || 1;
      const runs = inline?.children ? await inlineTokensToRuns(inline.children, context, { bold: true }) : [new TextRun({ text: "" })];
      elements.push(paragraphFromRuns(runs, context, { heading: Math.min(6, Math.max(1, level)), quote: quoteDepth > 0 }));
      index += 3;
      continue;
    }
    if (token.type === "paragraph_open") {
      const inline = tokens[index + 1];
      const runs = inline?.children ? await inlineTokensToRuns(inline.children, context) : [new TextRun({ text: "" })];
      elements.push(paragraphFromRuns(runs, context, { quote: quoteDepth > 0 }));
      index += 3;
      continue;
    }
    if (token.type === "bullet_list_open" || token.type === "ordered_list_open") {
      const parsed = await listToDocx(tokens, index, context, quoteDepth);
      elements.push(...parsed.elements);
      index = parsed.next;
      continue;
    }
    if (token.type === "blockquote_open") {
      let depth = 1;
      let end = index + 1;
      while (end < tokens.length && depth > 0) {
        if (tokens[end].type === "blockquote_open") depth += 1;
        if (tokens[end].type === "blockquote_close") depth -= 1;
        end += 1;
      }
      elements.push(...await blocksToDocx(tokens.slice(index + 1, end - 1), context, quoteDepth + 1));
      index = end;
      continue;
    }
    if (token.type === "fence" || token.type === "code_block") {
      const language = (token.info || "").trim();
      if (language) elements.push(paragraphFromRuns([new TextRun({ text: language, bold: true, font: context.style.codeFamily, size: 18, color: "586273" })], context, { code: true }));
      elements.push(...codeBlockParagraphs(token.content || "", context));
      index += 1;
      continue;
    }
    if (token.type === "hr") {
      elements.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "C9D0DA", space: 4 } }, spacing: { before: 180, after: 180 } }));
      index += 1;
      continue;
    }
    if (token.type === "table_open") {
      const parsed = await tableToDocx(tokens, index, context);
      if (parsed.element) elements.push(parsed.element);
      index = parsed.next;
      continue;
    }
    index += 1;
  }
  return elements;
}

export async function createStructuredDocxBuffer(source, options = {}) {
  const style = { ...DEFAULT_WORD_STYLE, ...options.style };
  const context = { style, resolveImage: options.resolveImage };
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const tokens = markdown.parse(markdownForStructuredWord(source), {});
  const elements = await blocksToDocx(tokens, context);
  const doc = new Document({
    title: options.title || "Markdown 导出",
    styles: {
      default: { document: { run: { font: style.fontFamily, size: style.fontSize * 2 } } },
      heading1: { run: { font: style.headingFamily, size: 44, bold: true } },
      heading2: { run: { font: style.headingFamily, size: 34, bold: true } },
      heading3: { run: { font: style.headingFamily, size: 28, bold: true } }
    },
    sections: [{ children: elements.length ? elements : [new Paragraph({ text: "" })] }]
  });
  // Bytes, not a Node Buffer: desktop writes them with fs, mobile into the vault.
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}

export { imageDimensions, markdownForStructuredWord };
