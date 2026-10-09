import { electronRemote, hasDesktopExports } from "./desktop-runtime.js";
import { prepareMarkdownTextForPandoc } from "./pandoc-markdown.js";
import { composePages } from "./reading-pagination.js";
import { MM, paperSize } from "./page-controls.js";
import { applyAppearancePreferences } from "./appearance.js";
import { loadChunk } from "./chunks.js";
import { base64ToBytes, bytesToBase64 } from "./bytes.js";
import { capturePortable, rasterizeSvg } from "./portable-capture.js";
import { prepareMarkdownTextForPandoc } from "./pandoc-markdown.js";
import { exportNotePptx, buildDeck } from "./slides.js";
import { previewThenExport } from "./export-preview.js";
import { buildImagePdf } from "./image-pdf.js";
const { Menu, Notice, Component, Platform } = require("obsidian");

/* --------------------------------------------------------------------------
 * Export
 *
 * Every format starts from the same pages the paged reading view shows
 * (composePages), laid out at 100% in light mode on an export stage:
 *   PDF          – Obsidian's own print-to-pdf IPC (the same path as its
 *                  "Export to PDF"), @page sized to the paper, margin 0 since
 *                  each page already carries its margins. Text stays text.
 *   Page images  – each page captured with webContents.capturePage, in
 *                  viewport-high slices stitched on a canvas.
 *   Long image   – the unpaged strip with page margins, captured the same way.
 *   Word         – Pandoc (the CLI, not the Obsidian plugin). Obsidian-only
 *                  syntax is rewritten first; Mermaid diagrams are captured
 *                  from the render and embedded as PNG; WebP images, which
 *                  Word cannot show, are converted to PNG.
 * -------------------------------------------------------------------------- */

/* Every export first opens a preview window; the export itself runs only
   when it is confirmed there. */
function exportActions(plugin, file) {
  const deps = { prepareHtmlDocument: plugin.exporters.html, prepareRichCopyMarkup, pageVarsAtFullScale, buildDeck };
  const preview = (kind, run) => () => previewThenExport(plugin, file, kind, deps, run);
  return {
    pdf: { title: "导出 PDF", icon: "lucide-file-down", run: preview("pdf", () => runExport("PDF", () => exportPdf(plugin, file))) },
    word: { title: "导出 Word（.docx）", icon: "lucide-file-type", run: preview("word", () => runExport("Word", () => exportWord(plugin, file))) },
    // PPTX uses the presentation settings (skin, aspect ratio) and its own progress notice.
    pptxEditable: { title: "导出 PPTX（可编辑）", icon: "lucide-presentation", run: preview("pptx-editable", () => { void exportNotePptx(plugin, file, "editable"); }) },
    pptxImage: { title: "导出 PPTX（图片版）", icon: "lucide-image", run: preview("pptx-image", () => { void exportNotePptx(plugin, file, "image"); }) },
    wechat: { title: "复制为公众号格式", icon: "lucide-copy", run: preview("wechat", () => runCopy("公众号", () => copyFormattedNote(plugin, file, "wechat"))) },
    zhihu: { title: "复制为知乎格式", icon: "lucide-copy", run: preview("zhihu", () => runCopy("知乎", () => copyFormattedNote(plugin, file, "zhihu"))) },
    html: { title: "导出 HTML 阅读器", icon: "lucide-globe", run: preview("html", () => runExport("HTML", () => plugin.exporters.exportHtml(plugin, file))) },
    pages: { title: "导出分页图片", icon: "lucide-images", run: preview("pages", () => runExport("分页图片", () => exportImages(plugin, file, "pages"))) },
    long: { title: "导出长图", icon: "lucide-image", run: preview("long", () => runExport("长图", () => exportImages(plugin, file, "long"))) }
  };
}

function openExportMenu(plugin, view, event) {
  const file = view.file;
  if (!file) return;
  const menu = new Menu();
  if (!hasDesktopExports()) {
    addPortableExportItems(plugin, menu, file);
    menu.showAtMouseEvent(event);
    return;
  }
  const actions = exportActions(plugin, file);
  const groups = [["pdf", "word", "pptxEditable", "pptxImage"], ["wechat", "zhihu"], ["html"], ["pages", "long"]];
  groups.forEach((group, index) => {
    if (index) menu.addSeparator();
    for (const key of group) menu.addItem(item => item.setTitle(actions[key].title).setIcon(actions[key].icon).onClick(actions[key].run));
  });
  menu.showAtMouseEvent(event);
}

// Exports that work without Electron (mobile): saved into the vault's 导出/ folder.
function addPortableExportItems(plugin, menu, file) {
  const actions = exportActions(plugin, file);
  for (const key of ["pdf", "word", "html", "pptxEditable", "pptxImage", "pages", "long", "wechat", "zhihu"]) {
    menu.addItem(item => item.setTitle(actions[key].title).setIcon(actions[key].icon).setSection("ibp-export").onClick(actions[key].run));
  }
}

async function runExport(label, task) {
  const notice = new Notice(`正在导出${label}…`, 0);
  try {
    const result = await task();
    notice.hide();
    if (result) new Notice(`已导出${label}：${result}`, 6000);
  } catch (error) {
    notice.hide();
    console.error("Ignorance Advanced: export failed —", error);
    new Notice(`导出${label}失败：${error.message || error}`, 8000);
  }
}

async function runCopy(label, task) {
  const notice = new Notice(`正在整理${label}格式…`, 0);
  try {
    await task();
    notice.hide();
    new Notice(`已复制为${label}格式，可直接粘贴。`, 5000);
  } catch (error) {
    notice.hide();
    console.error("Ignorance Advanced: rich copy failed —", error);
    new Notice(`复制${label}格式失败：${error.message || error}`, 8000);
  }
}


function pageVarsAtFullScale(page) {
  const size = paperSize(page);
  const m = page.margins;
  const px = mm => `${(mm * MM).toFixed(2)}px`;
  return { "--ibp-page-w": px(size.w), "--ibp-page-h": px(size.h), "--ibp-mt": px(m.t), "--ibp-mr": px(m.r), "--ibp-mb": px(m.b), "--ibp-ml": px(m.l), "--ibp-page-gap": "0px" };
}

/* Capture the current appearance and isolate temporary export theme changes. */
async function withExportStage(plugin, file, { visible = false, keepStrip = false, onProgress = null, signal = null } = {}, task) {
  signal?.throwIfAborted();
  const body = document.body;
  const wasDark = body.hasClass("theme-dark");
  const capturing = body.dataset.ibThemeCapture;
  body.dataset.ibThemeCapture = "true";
  applyAppearancePreferences(plugin);
  const stage = body.createDiv({ cls: `ibp-export${visible ? " is-visible" : ""}` });
  for (const [name, value] of Object.entries(pageVarsAtFullScale(plugin.state.page))) stage.style.setProperty(name, value);
  const component = new Component();
  component.load();
  let themeRestored = false;
  const restoreTheme = () => {
    if (themeRestored) return;
    themeRestored = true;
    body.toggleClass("theme-light", !wasDark);
    body.toggleClass("theme-dark", wasDark);
    applyAppearancePreferences(plugin);
    if (capturing === undefined) delete body.dataset.ibThemeCapture;
    else body.dataset.ibThemeCapture = capturing;
  };
  const cancel = () => { component.unload(); stage.remove(); restoreTheme(); };
  signal?.addEventListener("abort", cancel, { once: true });
  let result = null;
  try {
    const active = plugin.app.workspace.activeLeaf?.view;
    const text = active?.file?.path === file.path && active.getMode?.() === "source" && active.editor
      ? active.editor.getValue() : await plugin.app.vault.cachedRead(file);
    result = await composePages(plugin, file, text, stage, component, { keepStrip, expandDetails: true, onProgress, signal });
    signal?.throwIfAborted();
    if (!result) throw new Error("排版失败：页面尺寸无效");
    return await task(stage, result, text);
  } finally {
    signal?.removeEventListener("abort", cancel);
    component.unload();
    result?.staging?.remove();
    stage.remove();
    restoreTheme();
  }
}

const CLIPBOARD_STYLE_PROPERTIES = [
  "display", "box-sizing", "width", "max-width", "min-width", "height", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "border", "border-top", "border-right", "border-bottom", "border-left", "border-collapse", "border-spacing", "border-radius",
  "background-color", "color", "font-family", "font-size", "font-style", "font-weight", "line-height",
  "text-align", "text-decoration", "text-indent", "text-transform", "letter-spacing", "vertical-align",
  "white-space", "word-break", "overflow-wrap", "list-style-type", "list-style-position",
  "flex", "flex-direction", "flex-wrap", "align-items", "justify-content", "gap",
  "grid-template-columns", "grid-template-rows", "grid-column", "grid-row", "column-count", "column-gap",
  "opacity", "object-fit", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "fill-opacity", "stroke-opacity", "filter"
];

function inlineComputedStyles(source, target, properties = CLIPBOARD_STYLE_PROPERTIES) {
  const computed = getComputedStyle(source);
  for (const name of properties) {
    const value = computed.getPropertyValue(name);
    if (value) target.style.setProperty(name, value);
  }
}

/* Mobile has no page capture. Canvas charts export themselves; an SVG is
   drawn onto a canvas once its theme variables are resolved. SVGs with HTML
   labels (foreignObject) would taint that canvas, so they stay as SVG. */
async function portableElementPng(source) {
  const canvas = source instanceof HTMLCanvasElement ? source : source.querySelector?.("canvas");
  if (canvas) return canvas.toDataURL("image/png");
  // The largest SVG is the diagram (smaller ones are header icons).
  const svgs = source instanceof SVGSVGElement ? [source] : [...(source.querySelectorAll?.("svg") || [])].filter(svg => !svg.parentElement?.closest("svg"));
  const svg = svgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  if (!svg) return null;
  // HTML labels and theme paint are handled by the shared rasterizer.
  const raster = await rasterizeSvg(svg);
  if (raster) return raster.src;
  if (svg.querySelector("foreignObject")) return null;
  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width)), height = Math.max(1, Math.ceil(rect.height));
  const styles = getComputedStyle(svg);
  const markup = new XMLSerializer().serializeToString(svg)
    .replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (whole, name, fallback) => styles.getPropertyValue(name).trim() || fallback || whole);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const scale = 2;
    const out = document.createElement("canvas");
    out.width = width * scale;
    out.height = height * scale;
    out.getContext("2d").drawImage(image, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch (_) {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderedElementPng(source, alt = "") {
  const rect = source.getBoundingClientRect();
  const image = document.createElement("img");
  let captured = null;
  if (hasDesktopExports()) {
    // Page capture fails for elements outside the window (long notes); fall
    // back to painting the element in-page.
    try { captured = `data:image/png;base64,${bytesToBase64(await captureElement(source))}`; } catch (_) { source.style.transform = ""; }
    if (!captured) captured = await portableElementPng(source);
    if (!captured) {
      try { captured = `data:image/png;base64,${bytesToBase64(await capturePortable(source))}`; } catch (_) {}
    }
    if (!captured) return source.cloneNode(true);
    image.src = captured;
  } else {
    const dataUri = await portableElementPng(source);
    if (!dataUri) return source.cloneNode(true);
    image.src = dataUri;
  }
  image.alt = alt;
  inlineComputedStyles(source, image);
  if (rect.width > 0) image.style.setProperty("width", `${Math.ceil(rect.width)}px`);
  if (rect.height > 0) image.style.setProperty("height", `${Math.ceil(rect.height)}px`);
  image.style.setProperty("max-width", "100%");
  image.style.setProperty("height", "auto");
  return image;
}

function clipboardImageMime(path) {
  const extension = path.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff" })[extension] || "application/octet-stream";
}

function resourcePathKey(value) {
  try {
    const url = new URL(value, window.location.href);
    return `${url.protocol}//${url.host}${decodeURI(url.pathname)}`;
  } catch (_) {
    return String(value || "").split(/[?#]/)[0];
  }
}

function vaultImageIndex(plugin) {
  const byResource = new Map();
  for (const file of plugin.app.vault.getFiles()) {
    const resource = plugin.app.vault.getResourcePath(file);
    byResource.set(resource, file);
    byResource.set(resourcePathKey(resource), file);
  }
  return byResource;
}

async function localImageData(plugin, src, index, width = 800, height = 600) {
  if (!src || src.startsWith("data:")) return src;
  if (/^https?:\/\//i.test(src)) return src;
  const file = index.get(src) || index.get(resourcePathKey(src));
  if (!file) {
    try {
      const response = await fetch(src);
      if (response.ok) {
        const blob = await response.blob();
        if (blob.type.startsWith("image/")) return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (_) {}
    return src;
  }
  const mime = clipboardImageMime(file.path);
  if (mime === "image/svg+xml") return src;
  const binary = await plugin.app.vault.readBinary(file);
  return `data:${mime};base64,${bytesToBase64(binary)}`;
}

const OMIT_FROM_CLIPBOARD = new Set(["SCRIPT", "STYLE", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IFRAME", "OBJECT", "EMBED", "SOURCE"]);
const OMIT_CLIPBOARD_SELECTOR = ".ibm-block-header, .ibm-mermaid-toolbar, .ibp-page-number, .ib-table-resize-layer, .copy-button";

async function cloneForRichClipboard(source, plugin, imageIndex, target) {
  if (source.nodeType === Node.TEXT_NODE) return source.cloneNode(true);
  if (!(source instanceof Element) || OMIT_FROM_CLIPBOARD.has(source.tagName) || source.matches(OMIT_CLIPBOARD_SELECTOR)) return null;

  if (source instanceof SVGElement) {
    return renderedElementPng(source, source.getAttribute("aria-label") || source.getAttribute("title") || "");
  }

  if (source instanceof HTMLCanvasElement) {
    return renderedElementPng(source, "图表");
  }

  const copy = document.createElement(source.tagName.toLowerCase());
  for (const attribute of [...source.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name === "class" || name === "id" || name === "style" || name === "srcset" || name.startsWith("on") || name.startsWith("data-") || name.startsWith("aria-")) continue;
    if (name === "src" || name === "href") continue;
    copy.setAttribute(attribute.name, attribute.value);
  }
  if (source instanceof HTMLAnchorElement) {
    const href = source.href;
    if (/^(https?:|mailto:)/i.test(href)) copy.setAttribute("href", href);
  }
  inlineComputedStyles(source, copy);

  if (source instanceof HTMLImageElement) {
    const src = source.currentSrc || source.getAttribute("src") || "";
    if (/\.svg(?:[?#]|$)/i.test(src) || /^data:image\/svg\+xml/i.test(src)) return renderedElementPng(source, source.alt || "");
    const rect = source.getBoundingClientRect();
    copy.setAttribute("src", await localImageData(plugin, src, imageIndex, rect.width, rect.height) || "");
    copy.setAttribute("alt", source.alt || "");
    copy.style.setProperty("max-width", "100%");
    copy.style.setProperty("height", "auto");
  }

  for (const child of source.childNodes) {
    const cloned = await cloneForRichClipboard(child, plugin, imageIndex, target);
    if (cloned) copy.appendChild(cloned);
  }
  if (target === "wechat" && source.matches(".ibc-container--cols")) {
    copy.style.setProperty("display", "block");
    copy.style.setProperty("width", "100%");
    for (const child of copy.children) child.style.setProperty("width", "100%");
  }
  return copy;
}

async function prepareRichCopyMarkup(plugin, file, target = "wechat", { cover = true } = {}) {
  return withExportStage(plugin, file, { keepStrip: true, visible: cover }, async (stage, { pages, staging }) => {
    pages.forEach(page => page.remove());
    staging.removeClass("ibp-staging");
    const holder = stage.createDiv({ cls: "ibp-long-sheet" });
    holder.appendChild(staging);
    const imageIndex = vaultImageIndex(plugin);
    const columnLayouts = staging.querySelectorAll(".ibc-container--cols").length;
    const content = document.createElement("div");
    for (const child of staging.childNodes) {
      const clone = await cloneForRichClipboard(child, plugin, imageIndex, target);
      if (clone) content.appendChild(clone);
    }
    const style = getComputedStyle(document.body);
    const root = document.createElement("div");
    root.style.setProperty("box-sizing", "border-box");
    root.style.setProperty("width", "100%");
    root.style.setProperty("max-width", "100%");
    root.style.setProperty("margin", "0 auto");
    root.style.setProperty("font-family", style.getPropertyValue("--ib-font-sans").trim() || style.fontFamily);
    root.style.setProperty("font-size", getComputedStyle(staging).fontSize);
    root.style.setProperty("line-height", style.getPropertyValue("--ib-text-leading").trim() || getComputedStyle(staging).lineHeight);
    root.style.setProperty("color", style.getPropertyValue("--ib-text-primary").trim() || style.color);
    root.style.setProperty("background-color", style.getPropertyValue("--ib-bg-primary").trim() || "transparent");
    root.setAttribute("data-copy-target", target);
    root.appendChild(content);
    const html = `<meta charset="utf-8">${root.outerHTML}`;
    const text = staging.innerText.trim();
    return { html, text, target, svgCount: staging.querySelectorAll("svg").length, columnLayouts: target === "wechat" ? columnLayouts : 0 };
  });
}

async function copyFormattedNote(plugin, file, target = "wechat") {
  const clipboard = hasDesktopExports() ? electronRemote()?.clipboard : null;
  const payload = await prepareRichCopyMarkup(plugin, file, target);
  if (clipboard?.write) {
    clipboard.write({ text: payload.text, html: payload.html });
  } else if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    // Mobile: the web clipboard carries rich HTML too.
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([payload.html], { type: "text/html" }),
      "text/plain": new Blob([payload.text], { type: "text/plain" })
    })]);
  } else {
    throw new Error("当前设备没有可用的剪贴板接口");
  }
  return payload;
}

// Mobile: no print-to-pdf, so each page becomes a JPEG in an image-only PDF.
async function exportPdfToVault(plugin, file) {
  const size = paperSize(plugin.state.page);
  return withExportStage(plugin, file, { visible: true }, async (stage, { pages }) => {
    pages.forEach(p => p.style.display = "none");
    const images = [];
    for (let i = 0; i < pages.length; i += 1) {
      pages[i].style.display = "";
      images.push({ jpeg: await capturePortable(pages[i], { scale: 2, background: "#FFFFFF", type: "image/jpeg", quality: 0.9 }) });
      pages[i].style.display = "none";
      await nextFrame();
    }
    return saveExportToVault(plugin, `${file.basename}.pdf`, buildImagePdf(images, { widthMm: size.w, heightMm: size.h }));
  });
}

async function exportPdf(plugin, file, targetPath) {
  if (!hasDesktopExports() && !targetPath) return exportPdfToVault(plugin, file);
  const remote = electronRemote();
  const choice = targetPath ? { filePath: targetPath } : await remote.dialog.showSaveDialog({
    defaultPath: `${file.basename}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  });
  if (choice.canceled || !choice.filePath) return null;
  const size = paperSize(plugin.state.page);
  await withExportStage(plugin, file, {}, async stage => {
    stage.addClass("ibp-print-root");
    const style = document.head.createEl("style", { text: `@media print {
      @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
      html, body { height: auto !important; overflow: visible !important; background: #FFFFFF !important; }
      body > :not(.ibp-print-root) { display: none !important; }
    }` });
    const previousTitle = document.title;
    document.title = file.basename;
    try {
      await new Promise(resolve => {
        const ipc = window.electron.ipcRenderer;
        ipc.once("print-to-pdf", resolve);
        ipc.send("print-to-pdf", {
          filepath: choice.filePath, open: !targetPath, printBackground: true, preferCSSPageSize: true,
          // PDF bookmarks from the headings, and a tagged (accessible) PDF.
          generateDocumentOutline: true, generateTaggedPDF: true,
          pageSize: { width: size.w / 25.4, height: size.h / 25.4 },
          margins: { top: 0, bottom: 0, left: 0, right: 0 }
        });
      });
    } finally {
      if (document.title === file.basename) document.title = previousTitle;
      style.remove();
    }
  });
  return choice.filePath;
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/* Capture an element at device resolution: slide it under a fixed viewport
   one window-height at a time and stitch the slices. */
async function captureElement(element) {
  const contents = electronRemote().getCurrentWebContents();
  const dpr = window.devicePixelRatio || 1;
  element.style.transform = "";
  await nextFrame();
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width), height = Math.ceil(rect.height);
  const sliceH = Math.max(200, Math.floor(window.innerHeight - rect.top - 1));
  // Chromium caps a canvas edge at 65535px; shrink very long captures.
  const scale = Math.min(1, 60000 / (height * dpr));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * dpr * scale);
  canvas.height = Math.round(height * dpr * scale);
  const ctx = canvas.getContext("2d");
  for (let y = 0; y < height; y += sliceH) {
    element.style.transform = `translateY(${-y}px)`;
    await nextFrame();
    const h = Math.min(sliceH, height - y);
    const shot = await contents.capturePage({ x: Math.round(rect.left), y: Math.round(rect.top), width, height: h });
    const bitmap = await createImageBitmap(new Blob([shot.toPNG()], { type: "image/png" }));
    ctx.drawImage(bitmap, 0, Math.round(y * dpr * scale), Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  }
  element.style.transform = "";
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  return Buffer.from(await blob.arrayBuffer());
}

// Mobile: paint the same staged pages in-page and write the PNGs into 导出/.
async function exportImagesToVault(plugin, file, kind) {
  return withExportStage(plugin, file, { visible: true, keepStrip: kind === "long" }, async (stage, { pages, staging }) => {
    if (kind === "pages") {
      pages.forEach(p => p.style.display = "none");
      const digits = Math.max(2, String(pages.length).length);
      let first = "";
      for (let i = 0; i < pages.length; i += 1) {
        pages[i].style.display = "";
        const png = await capturePortable(pages[i], { scale: 2 });
        const saved = await saveExportToVault(plugin, `${file.basename}-${String(i + 1).padStart(digits, "0")}.png`, png);
        first ||= saved;
        pages[i].style.display = "none";
        await nextFrame(); // let taps and the progress notice through between pages
      }
      return `${first.replace(/[^/]+$/, "")}（${pages.length} 张）`;
    }
    pages.forEach(p => p.remove());
    const sheet = stage.createDiv({ cls: "ibp-long-sheet" });
    staging.removeClass("ibp-staging");
    sheet.appendChild(staging);
    return saveExportToVault(plugin, `${file.basename}.png`, await capturePortable(sheet, { scale: 2 }));
  });
}

async function exportImages(plugin, file, kind, targetPath) {
  if (!hasDesktopExports() && !targetPath) return exportImagesToVault(plugin, file, kind);
  const remote = electronRemote();
  const fs = require("fs"), path = require("path");
  let target = targetPath;
  if (target) {
    // Given by the caller (tests); skip the dialog.
  } else if (kind === "pages") {
    const choice = await remote.dialog.showOpenDialog({ title: "选择保存分页图片的文件夹", properties: ["openDirectory", "createDirectory"] });
    if (choice.canceled || !choice.filePaths?.[0]) return null;
    target = choice.filePaths[0];
  } else {
    const choice = await remote.dialog.showSaveDialog({ defaultPath: `${file.basename}.png`, filters: [{ name: "PNG", extensions: ["png"] }], properties: ["showOverwriteConfirmation", "createDirectory"] });
    if (choice.canceled || !choice.filePath) return null;
    target = choice.filePath;
  }
  return withExportStage(plugin, file, { visible: true, keepStrip: kind === "long" }, async (stage, { pages, staging }) => {
    if (kind === "pages") {
      pages.forEach(p => p.style.display = "none");
      const digits = String(pages.length).length;
      for (let i = 0; i < pages.length; i += 1) {
        pages[i].style.display = "";
        const png = await captureElement(pages[i]);
        fs.writeFileSync(path.join(target, `${file.basename}-${String(i + 1).padStart(Math.max(2, digits), "0")}.png`), png);
        pages[i].style.display = "none";
      }
      return `${target}（${pages.length} 张）`;
    }
    pages.forEach(p => p.remove());
    const sheet = stage.createDiv({ cls: "ibp-long-sheet" });
    staging.removeClass("ibp-staging");
    sheet.appendChild(staging);
    fs.writeFileSync(target, await captureElement(sheet));
    return target;
  });
}

function findPandoc() {
  const fs = require("fs");
  return ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc", "C:\\Program Files\\Pandoc\\pandoc.exe"].find(p => fs.existsSync(p)) || null;
}

async function toPngFile(src, dest) {
  const fs = require("fs");
  const bitmap = await createImageBitmap(new Blob([fs.readFileSync(src)]));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  fs.writeFileSync(dest, Buffer.from(await blob.arrayBuffer()));
}

/* Rewrite Obsidian-only syntax into plain Markdown Pandoc understands. */
async function prepareMarkdownForPandoc(plugin, file, text, tmp, diagrams, { structuredWord = false } = {}) {
  const path = require("path");
  const base = plugin.app.vault.adapter.getBasePath();
  const noteDir = path.join(base, file.parent?.path || "");
  let imageIndex = 0;
  const resolveLocalImage = async target => {
    const clean = decodeURIComponent(target.split("#")[0].split("|")[0]);
    const linked = plugin.app.metadataCache.getFirstLinkpathDest(clean, file.path);
    const abs = linked ? path.join(base, linked.path) : path.resolve(noteDir, clean);
    if (/\.(webp|avif|heic)$/i.test(abs) || (structuredWord && /\.(svg|tiff?)$/i.test(abs))) {
      const out = path.join(tmp, `image-${++imageIndex}.png`);
      try { await toPngFile(abs, out); return out; } catch (_) { return abs; }
    }
    return abs;
  };
  return prepareMarkdownTextForPandoc(text, diagrams, resolveLocalImage);
}

function wordFontFromToken(value, fallback) {
  const first = String(value || "").split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  return first || fallback;
}

async function resolveStructuredWordImage(plugin, file, tmp, source) {
  const fs = require("fs"), path = require("path");
  const dataUri = String(source).match(/^data:image\/(png|jpe?g|gif|bmp);base64,([\s\S]+)$/i);
  if (dataUri) {
    const type = dataUri[1].toLowerCase().replace("jpeg", "jpg");
    return { type, data: Buffer.from(dataUri[2], "base64") };
  }
  if (/^(?:https?:|mailto:)/i.test(source)) return null;

  const base = plugin.app.vault.adapter.getBasePath();
  const clean = decodeURIComponent(String(source).replace(/^<|>$/g, "").split("#")[0]);
  const linked = plugin.app.metadataCache.getFirstLinkpathDest(clean, file.path);
  let absolute = linked ? path.join(base, linked.path) : (path.isAbsolute(clean) ? clean : path.resolve(base, file.parent?.path || "", clean));
  let extension = path.extname(absolute).toLowerCase().slice(1);
  if (!fs.existsSync(absolute)) return null;
  if (["webp", "avif", "heic", "svg", "tif", "tiff"].includes(extension)) {
    const png = path.join(tmp, `structured-image-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
    try {
      await toPngFile(absolute, png);
      absolute = png;
      extension = "png";
    } catch (_) {
      return null;
    }
  }
  const type = extension === "jpeg" ? "jpg" : extension;
  if (!["jpg", "png", "gif", "bmp"].includes(type)) return null;
  return { type, data: fs.readFileSync(absolute) };
}

/* Mobile has no save dialog, file system or Pandoc: exports are written into
   the vault's 导出/ folder, from where the system share sheet takes over. */
const EXPORT_FOLDER = "导出";

async function saveExportToVault(plugin, name, data) {
  const vault = plugin.app.vault;
  if (!vault.getAbstractFileByPath(EXPORT_FOLDER)) await vault.createFolder(EXPORT_FOLDER).catch(() => {});
  const dot = name.lastIndexOf(".");
  const stem = name.slice(0, dot), extension = name.slice(dot);
  let path = `${EXPORT_FOLDER}/${name}`;
  for (let index = 2; vault.getAbstractFileByPath(path); index += 1) path = `${EXPORT_FOLDER}/${stem} ${index}${extension}`;
  if (typeof data === "string") await vault.create(path, data);
  else await vault.createBinary(path, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return path;
}

// A Mermaid diagram drawn by the (bundled) engine, as a PNG data URI.
async function mermaidToPngDataUri(source, index) {
  // HTML labels (foreignObject) would taint the canvas and block toDataURL.
  const plain = /^\s*%%\{\s*init/.test(source) ? source : `%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n${source}`;
  const { svg } = await globalThis.mermaid.render(`ibp-word-mermaid-${Date.now()}-${index}`, plain);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 800) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 450) * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function vaultImageForWord(plugin, file, source) {
  const dataUri = String(source).match(/^data:image\/(png|jpe?g|gif|bmp);base64,([\s\S]+)$/i);
  if (dataUri) return { type: dataUri[1].toLowerCase().replace("jpeg", "jpg"), data: base64ToBytes(dataUri[2]) };
  if (/^(?:https?:|mailto:)/i.test(source)) return null;
  const clean = decodeURIComponent(String(source).replace(/^<|>$/g, "").split("#")[0]);
  const linked = plugin.app.metadataCache.getFirstLinkpathDest(clean, file.path) || plugin.app.vault.getAbstractFileByPath(clean);
  if (!linked?.extension) return null;
  const bytes = new Uint8Array(await plugin.app.vault.readBinary(linked));
  const extension = linked.extension.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "bmp"].includes(extension)) return { type: extension === "jpeg" ? "jpg" : extension, data: bytes };
  // WebP, SVG, AVIF…: let the browser decode and re-encode as PNG.
  try {
    const mime = extension === "svg" ? "image/svg+xml" : `image/${extension}`;
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
    return { type: "png", data: base64ToBytes(canvas.toDataURL("image/png").split(",")[1]) };
  } catch (_) {
    return null;
  }
}

async function exportWordToVault(plugin, file) {
  const text = await plugin.app.vault.cachedRead(file);
  const diagrams = [];
  // Same fences, in the same order, as prepareMarkdownTextForPandoc replaces.
  const fences = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  for (const [index, fence] of fences.entries()) {
    try { diagrams.push(await mermaidToPngDataUri(fence[1], index)); } catch (_) { diagrams.push(""); }
  }
  const markdown = await prepareMarkdownTextForPandoc(text, diagrams, async target => {
    const clean = decodeURIComponent(target.split("#")[0].split("|")[0]);
    return plugin.app.metadataCache.getFirstLinkpathDest(clean, file.path)?.path || clean;
  });
  const bodyStyle = getComputedStyle(document.body);
  const { createStructuredDocxBuffer } = await loadChunk("chunk-docx.cjs");
  const bytes = await createStructuredDocxBuffer(markdown, {
    title: file.basename,
    style: {
      fontFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-sans"), "Arial"),
      headingFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-heading"), "Arial"),
      codeFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-mono"), "Consolas")
    },
    resolveImage: source => vaultImageForWord(plugin, file, source)
  });
  return saveExportToVault(plugin, `${file.basename}.docx`, bytes);
}

async function exportWord(plugin, file, targetPath, options = {}) {
  if (!hasDesktopExports()) return exportWordToVault(plugin, file);
  const pandoc = Object.prototype.hasOwnProperty.call(options, "pandocPath") ? options.pandocPath : findPandoc();
  const remote = electronRemote();
  const choice = targetPath ? { filePath: targetPath } : await remote.dialog.showSaveDialog({ defaultPath: `${file.basename}.docx`, filters: [{ name: "Word", extensions: ["docx"] }], properties: ["showOverwriteConfirmation", "createDirectory"] });
  if (choice.canceled || !choice.filePath) return null;
  const fs = require("fs"), path = require("path"), os = require("os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ibp-docx-"));
  try {
    const text = await plugin.app.vault.cachedRead(file);
    // Capture rendered Mermaid diagrams, in source order, as PNGs.
    const diagrams = [];
    if (/```mermaid/.test(text)) {
      await withExportStage(plugin, file, { visible: true, keepStrip: true }, async (stage, { pages, staging }) => {
        pages.forEach(p => p.remove());
        staging.removeClass("ibp-staging");
        const holder = stage.createDiv({ cls: "ibp-long-sheet" });
        holder.appendChild(staging);
        for (const diagram of staging.querySelectorAll(":scope > .mermaid, :scope > div > .mermaid")) {
          const out = path.join(tmp, `mermaid-${diagrams.length + 1}.png`);
          const solo = stage.createDiv({ cls: "ibp-capture-solo markdown-rendered" });
          solo.appendChild(diagram.cloneNode(true));
          holder.style.display = "none";
          fs.writeFileSync(out, await captureElement(solo));
          solo.remove();
          holder.style.display = "";
          diagrams.push(out);
        }
      });
    }
    const markdown = await prepareMarkdownForPandoc(plugin, file, text, tmp, diagrams, { structuredWord: !pandoc });
    if (!pandoc) {
      const bodyStyle = getComputedStyle(document.body);
      const { createStructuredDocxBuffer } = await loadChunk("chunk-docx.cjs");
      const buffer = await createStructuredDocxBuffer(markdown, {
        title: file.basename,
        style: {
          fontFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-sans"), "Arial"),
          headingFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-heading"), "Arial"),
          codeFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-mono"), "Consolas")
        },
        resolveImage: source => resolveStructuredWordImage(plugin, file, tmp, source)
      });
      fs.writeFileSync(choice.filePath, buffer);
      if (!targetPath) remote.shell?.openPath(choice.filePath);
      return choice.filePath;
    }

    const source = path.join(tmp, "note.md");
    fs.writeFileSync(source, markdown);
    const base = plugin.app.vault.adapter.getBasePath();
    await new Promise((resolve, reject) => {
      require("child_process").execFile(pandoc, [
        source, "-f", "markdown+mark+pipe_tables+tex_math_dollars+task_lists", "-t", "docx",
        "-o", choice.filePath, "--resource-path", [path.join(base, file.parent?.path || ""), base, tmp].join(path.delimiter)
      ], { timeout: 120000 }, (error, _out, stderr) => error ? reject(new Error(stderr || error.message)) : resolve());
    });
    if (!targetPath) remote.shell.openPath(choice.filePath);
    return choice.filePath;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}


export {
  openExportMenu,
  addPortableExportItems,
  runExport,
  pageVarsAtFullScale,
  withExportStage,
  exportPdf,
  nextFrame,
  captureElement,
  exportImages,
  findPandoc,
  toPngFile,
  prepareMarkdownForPandoc,
  exportWord,
  saveExportToVault,
  prepareRichCopyMarkup,
  copyFormattedNote,
  CLIPBOARD_STYLE_PROPERTIES,
  clipboardImageMime,
  resourcePathKey,
  vaultImageIndex
};
