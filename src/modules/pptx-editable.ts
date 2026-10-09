import { bytesToBase64 } from "./bytes.js";
/* Editable PPTX: rebuild a rendered slide as native PowerPoint objects.
   Text blocks, lists, tables and code become text boxes / tables with the
   rendered font, size, colour and position; pictures and charts become
   separate images. Everything else (skin backgrounds, frames, decorations,
   callout boxes) is captured as the slide's background picture with those
   objects hidden, so the slide still looks like the preview. */
import { collapseWhitespace, cssColor, fontFace, fontPoints, groupAdjacentBlocks, hasCjk, isBold, textAlign } from "./pptx-style.js";

/* Whether a font is installed and draws the given sample itself: text drawn in
   "font, fallback" measures differently from the fallback alone only when the
   font supplied the glyphs. Checked against two fallbacks to avoid false hits. */
const fontCache = new Map();
function fontDraws(name, sample) {
  const key = `${name}\u0000${sample}`;
  if (fontCache.has(key)) return fontCache.get(key);
  const ctx = document.createElement("canvas").getContext("2d");
  const width = font => { ctx.font = `40px ${font}`; return ctx.measureText(sample).width; };
  const quoted = `"${name.replace(/"/g, "")}"`;
  const result = ["monospace", "serif"].some(fallback => Math.abs(width(`${quoted}, ${fallback}`) - width(fallback)) > 0.5);
  fontCache.set(key, result);
  return result;
}
function faceFor(family, text) {
  const sample = hasCjk(text) ? "永和九年岁在癸丑" : "Handgloves 0123";
  return fontFace(family, name => fontDraws(name, sample));
}

const CHART_SVG = ".mermaid svg, .ib-echarts-block svg, [data-ib-echarts-state] svg";
const OPAQUE = "table, pre, ul, ol, svg, .mermaid, .ib-echarts-block, [data-ib-echarts-state]";
const TEXT_BLOCKS = "h1, h2, h3, h4, h5, h6, p, figcaption, dt, dd";

function isInline(el) {
  const display = getComputedStyle(el).display;
  return display === "inline" || display === "contents";
}

function hasOwnText(el) {
  return [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
}

// Everything on the slide that becomes a native object, in document order.
export function collectSlideObjects(surface) {
  const charts = [...surface.querySelectorAll(CHART_SVG)].filter(svg => !svg.parentElement.closest("svg"));
  const images = [...surface.querySelectorAll("img")].filter(img => !img.closest(".mermaid, .ib-echarts-block") && img.naturalWidth > 0);
  const tables = [...surface.querySelectorAll("table")].filter(el => !el.parentElement.closest(OPAQUE));
  const codes = [...surface.querySelectorAll("pre")].filter(el => !el.parentElement.closest(OPAQUE));
  const lists = [...surface.querySelectorAll("ul, ol")].filter(el => !el.parentElement.closest(OPAQUE) && !el.closest("li"));
  const texts = [...surface.querySelectorAll("*")].filter(el => {
    if (el.closest(OPAQUE) || isInline(el)) return false;
    if (el.matches(TEXT_BLOCKS)) return el.textContent.trim().length > 0 && !(el.querySelector("img") && !el.textContent.trim());
    return hasOwnText(el);
  });
  return { charts, images, tables, codes, lists, texts };
}

export function makeGeometry(surface, slideWidth, slideHeight, canvasWidth) {
  const frame = surface.getBoundingClientRect();
  const box = el => {
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - frame.left) / frame.width * slideWidth,
      y: (r.top - frame.top) / frame.height * slideHeight,
      w: r.width / frame.width * slideWidth,
      h: r.height / frame.height * slideHeight
    };
  };
  const points = px => fontPoints(px, canvasWidth, slideWidth);
  const inches = px => px / frame.height * slideHeight;
  return { box, points, inches };
}

function runOptions(el, points, text = "") {
  const css = getComputedStyle(el);
  const color = cssColor(css.color);
  const link = el.closest("a[href]");
  const options: Record<string, unknown> = {
    fontFace: faceFor(css.fontFamily, text),
    fontSize: points(parseFloat(css.fontSize) || 16),
    bold: isBold(css.fontWeight),
    italic: css.fontStyle === "italic",
    underline: css.textDecorationLine.includes("underline") ? { style: "sng" } : undefined,
    strike: css.textDecorationLine.includes("line-through") ? "sngStrike" : undefined
  };
  if (color) options.color = color.hex;
  const href = link?.getAttribute("href");
  if (href && /^https?:/i.test(href)) options.hyperlink = { url: href };
  return options;
}

// Inline text of a block as pptxgenjs runs; nested blocks are left to their own objects.
export function textRuns(block, points) {
  const runs = [];
  const walk = node => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = collapseWhitespace(child.textContent);
        if (text) runs.push({ text, options: runOptions(child.parentElement, points, text) });
      } else if (child instanceof HTMLBRElement) {
        runs.push({ text: "", options: { breakLine: true } });
      } else if (child instanceof HTMLElement && isInline(child) && !child.matches("svg, img")) {
        walk(child);
      }
    }
  };
  walk(block);
  if (runs.length) {
    runs[0].text = runs[0].text.replace(/^ /, "");
    runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/ $/, "");
  }
  return runs.filter(run => run.text || run.options.breakLine);
}

function paragraphOptions(el, points) {
  const css = getComputedStyle(el);
  const size = parseFloat(css.fontSize) || 16;
  const lineHeight = parseFloat(css.lineHeight);
  const fill = cssColor(css.backgroundColor);
  return {
    align: textAlign(css.textAlign),
    valign: "top",
    margin: 0,
    fontFace: faceFor(css.fontFamily, el.textContent),
    fontSize: points(size),
    lineSpacingMultiple: Number.isFinite(lineHeight) ? Math.round(lineHeight / size * 100) / 100 : 1.2,
    fill: fill ? { color: fill.hex, transparency: fill.transparency } : undefined,
    isTextBox: true,
    wrap: true
  };
}

// List items → paragraphs with bullets / numbers and nesting levels.
export function listRuns(list, points, level = 0) {
  const runs = [];
  const ordered = list.tagName === "OL";
  for (const item of list.children) {
    if (item.tagName !== "LI") continue;
    const own = textRuns(item, points);
    if (own.length) {
      for (const run of own) Object.assign(run.options, { bullet: ordered ? { type: "number" } : true, indentLevel: level });
      own[own.length - 1].options.breakLine = true;
      runs.push(...own);
    }
    for (const nested of item.querySelectorAll(":scope > ul, :scope > ol")) runs.push(...listRuns(nested, points, level + 1));
  }
  return runs;
}

function tableRows(table, points) {
  return [...table.rows].map(row => [...row.cells].map(cell => {
    const css = getComputedStyle(cell);
    const fill = cssColor(css.backgroundColor) || cssColor(getComputedStyle(row).backgroundColor);
    const color = cssColor(css.color);
    return {
      text: collapseWhitespace(cell.innerText).trim(),
      options: {
        bold: isBold(css.fontWeight),
        color: color?.hex,
        fill: fill ? { color: fill.hex } : undefined,
        fontFace: faceFor(css.fontFamily, cell.textContent),
        fontSize: points(parseFloat(css.fontSize) || 14),
        align: textAlign(css.textAlign),
        valign: "middle"
      }
    };
  }));
}

// An <img> as a data URI. Web images drawn onto a canvas taint it, so those
// are fetched as bytes instead (requestUrl is not bound by CORS).
async function imageData(img) {
  const src = img.currentSrc || img.src;
  if (src.startsWith("data:")) return src;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  } catch (_) {}
  let bytes = null, type = "image/png";
  try {
    const response = await fetch(src);
    if (response.ok) { bytes = new Uint8Array(await response.arrayBuffer()); type = response.headers.get("content-type") || type; }
  } catch (_) {}
  if (!bytes) {
    const response = await require("obsidian").requestUrl({ url: src, throw: false });
    if (response.status !== 200) throw new Error(`图片下载失败：${src}`);
    bytes = new Uint8Array(response.arrayBuffer);
    type = response.headers?.["content-type"] || type;
  }
  return `data:${type.split(";")[0]};base64,${bytesToBase64(bytes)}`;
}

function svgData(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(new XMLSerializer().serializeToString(clone)))}`;
}

/* Adds one editable slide. `capture(el)` returns the PNG of the surface. */
export async function addEditableSlide(pptx, surface, size, capture) {
  const { slideWidth, slideHeight, canvasWidth } = size;
  const { box, points, inches } = makeGeometry(surface, slideWidth, slideHeight, canvasWidth);
  const objects = collectSlideObjects(surface);
  const hidden = [...objects.charts, ...objects.images, ...objects.tables, ...objects.codes, ...objects.lists, ...objects.texts];
  const placed = hidden.map(el => ({ el, rect: box(el) }));
  const rectOf = el => placed.find(item => item.el === el).rect;
  // Measure everything first; the background is captured with it all hidden.
  const previous = hidden.map(el => el.style.visibility);
  let background;
  try {
    hidden.forEach(el => { el.style.visibility = "hidden"; });
    background = await capture(surface);
  } finally {
    hidden.forEach((el, index) => { el.style.visibility = previous[index]; });
  }
  const slide = pptx.addSlide();
  slide.addImage({ data: `data:image/png;base64,${bytesToBase64(background)}`, x: 0, y: 0, w: slideWidth, h: slideHeight });
  const slack = rect => ({ ...rect, w: Math.min(rect.w * 1.04 + 0.02, slideWidth - rect.x) });

  for (const img of objects.images) slide.addImage({ data: await imageData(img), ...rectOf(img) });
  for (const svg of objects.charts) {
    const rect = rectOf(svg);
    if (rect.w > 0.02 && rect.h > 0.02) slide.addImage({ data: svgData(svg), ...rect });
  }
  for (const table of objects.tables) {
    const rect = rectOf(table);
    const widths = [...(table.rows[0]?.cells || [])].map(cell => box(cell).w);
    slide.addTable(tableRows(table, points), { x: rect.x, y: rect.y, w: rect.w, colW: widths.length ? widths : undefined, margin: 0.05, border: { type: "solid", pt: 0.5, color: "D0D0D0" } });
  }
  for (const pre of objects.codes) {
    const code = pre.querySelector("code") || pre;
    const lines = [...code.querySelectorAll(".code-text")];
    const text = lines.length ? lines.map(line => line.textContent).join("\n") : code.textContent.replace(/\n$/, "");
    const options = paragraphOptions(code, points);
    const fill = cssColor(getComputedStyle(pre).backgroundColor);
    slide.addText(text, { ...options, ...slack(rectOf(pre)), fill: fill ? { color: fill.hex } : undefined, margin: 0.08 });
  }
  for (const list of objects.lists) {
    const runs = listRuns(list, points);
    if (runs.length) slide.addText(runs, { ...paragraphOptions(list, points), ...slack(rectOf(list)) });
  }
  // Consecutive paragraphs with the same style become one text box with
  // several paragraphs, as someone would build the slide by hand.
  const texts = objects.texts.map(block => ({ block, runs: textRuns(block, points), options: paragraphOptions(block, points) })).filter(item => item.runs.length);
  const candidates = texts.map(({ block, options }) => {
    const { fill, ...style } = options;
    return {
      key: `${block.tagName.replace(/^P$|^DD$|^DT$|^FIGCAPTION$/, "P")}|${JSON.stringify(style)}|${JSON.stringify(fill || null)}`,
      parent: block.parentElement,
      rect: rectOf(block),
      lineHeight: inches(parseFloat(getComputedStyle(block).lineHeight) || parseFloat(getComputedStyle(block).fontSize) * 1.4)
    };
  });
  for (const group of groupAdjacentBlocks(candidates)) {
    const members = group.map(index => texts[index]);
    const runs = [];
    members.forEach((member, index) => {
      const own = member.runs.map(run => ({ text: run.text, options: { ...run.options } }));
      if (index < members.length - 1) own[own.length - 1].options.breakLine = true;
      runs.push(...own);
    });
    const rects = group.map(index => candidates[index].rect);
    const top = Math.min(...rects.map(r => r.y));
    const bottom = Math.max(...rects.map(r => r.y + r.h));
    const rect = { x: rects[0].x, y: top, w: Math.max(...rects.map(r => r.w)), h: bottom - top };
    const spacing = members.length > 1 ? points(parseFloat(getComputedStyle(members[0].block).marginBottom) || 0) : 0;
    slide.addText(runs, { ...members[0].options, ...slack(rect), paraSpaceAfter: spacing || undefined });
  }
}
