import { ExportCancelled, askSavePath, externalExportDir, folderOf, vaultBasePath, writeAt, writeOutside } from "./desktop-files.js";
import { openBookExport } from "./book-export.js";
import { tr } from "../i18n.js";
import { nextFrame } from "./layout-frame.js";
import { renderMermaidForExport } from "./mermaid-export.js";
import { wordExportFonts, wordFontFromToken } from "./word-font.js";
import { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Menu, Notice, Component, MarkdownView, Platform, requestUrl } from "obsidian";
import { setDocSheet, removeDocSheet } from "./doc-sheets.js";
import { hasDesktopExports } from "./desktop-runtime.js";
import { prepareMarkdownTextForPandoc } from "./pandoc-markdown.js";
import { composePages } from "./reading-pagination.js";
import type { PageState } from "../plugin-types.js";
import { MM, paperSize } from "./page-controls.js";
import { applyAppearancePreferences } from "./appearance.js";
import { loadChunk } from "./chunks.js";
import { base64ToBytes, bytesToBase64 } from "./bytes.js";
import { capturePortable, rasterizeSvg } from "./portable-capture.js";
import { exportNotePptx, buildDeck } from "./slides.js";
import { previewThenExport } from "./export-preview.js";
import { buildImagePdf } from "./image-pdf.js";

/* --------------------------------------------------------------------------
 * Export
 *
 * Every format starts from the same pages the paged reading view shows
 * (composePages), laid out at 100% in light mode on an export stage:
 *   PDF          – the system print dialog ("Save as PDF") on desktop, with
 *                  @page sized to the paper; an image-only PDF on mobile.
 *   Page images  – each page painted in-page (portable capture).
 *   Long image   – the unpaged strip with page margins, painted the same way.
 *   Word         – a structured .docx built in-page. Obsidian-only syntax is
 *                  rewritten first; Mermaid diagrams are embedded as PNG.
 * Files are saved into the vault's 导出/ folder.
 * -------------------------------------------------------------------------- */

/* Every export first opens a preview window; the export itself runs only
   when it is confirmed there. */
const errorText = (error: unknown): string => (error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error));

type ExportActionKey = "pdf" | "word" | "pptxEditable" | "pptxImage" | "wechat" | "zhihu" | "html" | "pages" | "long" | "book";
interface ExportAction { title: string; icon: string; run: () => void }

function exportActions(plugin: IgnorancePlugin, file: TFile): Record<ExportActionKey, ExportAction> {
  const deps = { prepareHtmlDocument: plugin.exporters.html, prepareRichCopyMarkup, pageVarsAtFullScale, buildDeck };
  const preview = (kind: string, run: () => void) => () => previewThenExport(plugin, file, kind, deps, run);
  return {
    pdf: { title: tr("导出 PDF"), icon: "lucide-file-down", run: preview("pdf", () => { void runExport("PDF", () => exportPdf(plugin, file)); }) },
    word: { title: tr("导出 Word（.docx）"), icon: "lucide-file-type", run: preview("word", () => { void runExport("Word", () => exportWord(plugin, file)); }) },
    // PPTX uses the presentation settings (skin, aspect ratio) and its own progress notice.
    pptxEditable: { title: tr("导出 PPTX（可编辑）"), icon: "lucide-presentation", run: preview("pptx-editable", () => { void exportNotePptx(plugin, file, "editable"); }) },
    pptxImage: { title: tr("导出 PPTX（图片版）"), icon: "lucide-image", run: preview("pptx-image", () => { void exportNotePptx(plugin, file, "image"); }) },
    wechat: { title: tr("复制为公众号格式"), icon: "lucide-copy", run: preview("wechat", () => { void runCopy(tr("公众号"), () => copyFormattedNote(plugin, file, "wechat")); }) },
    zhihu: { title: tr("复制为知乎格式"), icon: "lucide-copy", run: preview("zhihu", () => { void runCopy(tr("知乎"), () => copyFormattedNote(plugin, file, "zhihu")); }) },
    html: { title: tr("导出为 HTML"), icon: "lucide-globe", run: preview("html", () => { void runExport("HTML", () => plugin.exporters.exportHtml(plugin, file)); }) },
    pages: { title: tr("导出分页图片"), icon: "lucide-images", run: preview("pages", () => { void runExport(tr("分页图片"), () => exportImages(plugin, file, "pages")); }) },
    long: { title: tr("导出长图"), icon: "lucide-image", run: preview("long", () => { void runExport(tr("长图"), () => exportImages(plugin, file, "long")); }) },
    // Several notes become one book, so there is no single-note preview first.
    book: { title: tr("合成电子书（多篇）"), icon: "lucide-book-open", run: () => openBookExport(plugin) }
  };
}

function openExportMenu(plugin: IgnorancePlugin, view: MarkdownView, event: MouseEvent) {
  const file = view.file;
  if (!file) return;
  const menu = new Menu();
  const actions = exportActions(plugin, file);
  const groups: ExportActionKey[][] = [["pdf", "word", "pptxEditable", "pptxImage"], ["wechat", "zhihu"], ["html"], ["pages", "long"], ["book"]];
  groups.forEach((group, index) => {
    if (index) menu.addSeparator();
    for (const key of group) menu.addItem(item => item.setTitle(actions[key].title).setIcon(actions[key].icon).onClick(actions[key].run));
  });
  menu.showAtMouseEvent(event);
}

// Exports that work without Electron (mobile): saved into the vault's 导出/ folder.
function addPortableExportItems(plugin: IgnorancePlugin, menu: Menu, file: TFile) {
  const actions = exportActions(plugin, file);
  const keys: ExportActionKey[] = ["pdf", "word", "html", "pptxEditable", "pptxImage", "pages", "long", "wechat", "zhihu", "book"];
  for (const key of keys) {
    menu.addItem(item => item.setTitle(actions[key].title).setIcon(actions[key].icon).setSection("ibp-export").onClick(actions[key].run));
  }
}

async function runExport(label: string, task: () => Promise<string | null | undefined | void>) {
  const notice = new Notice(tr("正在导出{label}…", { label }), 0);
  try {
    const result = await task();
    notice.hide();
    if (result) new Notice(tr("已导出{label}：{result}", { label, result }), 6000);
  } catch (error) {
    notice.hide();
    if (error instanceof ExportCancelled) { new Notice(tr("已取消保存")); return; }
    console.error("Ignorance Advanced: export failed —", error);
    new Notice(tr("导出{label}失败：{v}", { label, v: errorText(error) }), 8000);
  }
}

async function runCopy(label: string, task: () => Promise<unknown>) {
  const notice = new Notice(tr("正在整理{label}格式…", { label }), 0);
  try {
    await task();
    notice.hide();
    new Notice(tr("已复制为{label}格式，可直接粘贴。", { label }), 5000);
  } catch (error) {
    notice.hide();
    console.error("Ignorance Advanced: rich copy failed —", error);
    new Notice(tr("复制{label}格式失败：{v}", { label, v: errorText(error) }), 8000);
  }
}


function pageVarsAtFullScale(page: PageState) {
  const size = paperSize(page);
  const m = page.margins;
  const px = (mm: number) => `${(mm * MM).toFixed(2)}px`;
  return { "--ibp-page-w": px(size.w), "--ibp-page-h": px(size.h), "--ibp-mt": px(m.t), "--ibp-mr": px(m.r), "--ibp-mb": px(m.b), "--ibp-ml": px(m.l), "--ibp-page-gap": "0px" };
}

/* Capture the current appearance and isolate temporary export theme changes. */
type StageResult = NonNullable<Awaited<ReturnType<typeof composePages>>>;
interface ExportStageOptions {
  visible?: boolean;
  keepStrip?: boolean;
  onProgress?: NonNullable<Parameters<typeof composePages>[5]>["onProgress"];
  signal?: AbortSignal | null;
}

async function withExportStage<T>(plugin: IgnorancePlugin, file: TFile, { visible = false, keepStrip = false, onProgress = null, signal = null }: ExportStageOptions = {}, task: (stage: HTMLElement, result: StageResult, text: string) => Promise<T>): Promise<T> {
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
  let result: StageResult | null = null;
  try {
    const active = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const text = active?.file?.path === file.path && active.getMode?.() === "source" && active.editor
      ? active.editor.getValue() : await plugin.app.vault.cachedRead(file);
    result = await composePages(plugin, file, text, stage, component, { keepStrip, expandDetails: true, onProgress, signal });
    signal?.throwIfAborted();
    if (!result) throw new Error(tr("排版失败：页面尺寸无效"));
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

function inlineComputedStyles(source: Element, target: HTMLElement, properties = CLIPBOARD_STYLE_PROPERTIES) {
  const computed = getComputedStyle(source);
  // A measured height would leave blank space once the text wraps differently in the target editor.
  const replaced = /^(img|svg|canvas|video|iframe|input)$/i.test(source.tagName);
  for (const name of properties) {
    if (!replaced && name === "height") continue;
    const value = computed.getPropertyValue(name);
    if (value) target.style.setProperty(name, value);
  }
}

/* Mobile has no page capture. Canvas charts export themselves; an SVG is
   drawn onto a canvas once its theme variables are resolved. SVGs with HTML
   labels (foreignObject) would taint that canvas, so they stay as SVG. */
async function portableElementPng(source: Element): Promise<string | null> {
  const canvas = source.instanceOf(HTMLCanvasElement) ? source : source.querySelector("canvas");
  if (canvas) return canvas.toDataURL("image/png");
  // The largest SVG is the diagram (smaller ones are header icons).
  const svgs = source.instanceOf(SVGSVGElement) ? [source] : [...source.querySelectorAll("svg")].filter(svg => !svg.parentElement?.closest("svg"));
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
    .replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (whole: string, name: string, fallback?: string) => styles.getPropertyValue(name).trim() || fallback || whole);
  const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const scale = 2;
    const out = createEl("canvas");
    out.width = width * scale;
    out.height = height * scale;
    out.getContext("2d")?.drawImage(image, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function renderedElementPng(source: Element, alt = ""): Promise<Node> {
  const rect = source.getBoundingClientRect();
  const image = createEl("img");
  let captured = await portableElementPng(source);
  if (!captured) {
    try { captured = `data:image/png;base64,${bytesToBase64(await capturePortable(source as HTMLElement))}`; } catch { /* keep the live copy below */ }
  }
  if (!captured) return source.cloneNode(true);
  image.src = captured;
  image.alt = alt;
  inlineComputedStyles(source, image);
  if (rect.width > 0) image.style.setProperty("width", `${Math.ceil(rect.width)}px`);
  if (rect.height > 0) image.style.setProperty("height", `${Math.ceil(rect.height)}px`);
  image.setCssStyles({ maxWidth: "100%" });
  image.setCssStyles({ height: "auto" });
  return image;
}

function clipboardImageMime(path: string) {
  const extension = path.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  const mimes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", tif: "image/tiff", tiff: "image/tiff" };
  return mimes[extension ?? ""] || "application/octet-stream";
}

function resourcePathKey(value: string) {
  try {
    const url = new URL(value, window.location.href);
    return `${url.protocol}//${url.host}${decodeURI(url.pathname)}`;
  } catch {
    return String(value || "").split(/[?#]/)[0];
  }
}

/** Looks up the vault file behind an image resource URL. */
export type ImageIndex = { get(resource: string): TFile | undefined };

// A resource URL ends with the file's vault path: try the path's tails, shortest
// prefix removed first, instead of listing every file in the vault.
function vaultImageIndex(plugin: IgnorancePlugin): ImageIndex {
  const { vault } = plugin.app;
  const found = new Map<string, TFile | undefined>();
  const get = (resource: string) => {
    const key = resourcePathKey(resource);
    if (found.has(key)) return found.get(key);
    let pathname = key;
    try { pathname = decodeURI(new URL(resource, window.location.href).pathname); } catch { /* keep the key */ }
    const parts = pathname.split("/").filter(Boolean);
    let match: TFile | undefined;
    for (let start = 0; start < parts.length && !match; start += 1) {
      const file = vault.getAbstractFileByPath(parts.slice(start).join("/"));
      if (file instanceof TFile && resourcePathKey(vault.getResourcePath(file)) === key) match = file;
    }
    found.set(key, match);
    return match;
  };
  return { get };
}

async function localImageData(plugin: IgnorancePlugin, src: string, index: ImageIndex, width = 800, height = 600) {
  if (!src || src.startsWith("data:")) return src;
  if (/^https?:\/\//i.test(src)) return src;
  const file = index.get(src) || index.get(resourcePathKey(src));
  if (!file) {
    // App resources (icons, blob: previews): decode and redraw them.
    try {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = createEl("canvas");
      canvas.width = image.naturalWidth || width;
      canvas.height = image.naturalHeight || height;
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch {
      return src;
    }
  }
  const mime = clipboardImageMime(file.path);
  if (mime === "image/svg+xml") return src;
  const binary = await plugin.app.vault.readBinary(file);
  return `data:${mime};base64,${bytesToBase64(binary)}`;
}

const OMIT_FROM_CLIPBOARD = new Set(["SCRIPT", "STYLE", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IFRAME", "OBJECT", "EMBED", "SOURCE"]);
const OMIT_CLIPBOARD_SELECTOR = ".ibm-block-header, .ibm-mermaid-toolbar, .ibp-page-number, .ib-table-resize-layer, .copy-button";

async function cloneForRichClipboard(source: Node, plugin: IgnorancePlugin, imageIndex: ImageIndex, target: string): Promise<Node | null> {
  if (source.nodeType === Node.TEXT_NODE) return source.cloneNode(true);
  if (!source.instanceOf(Element) || OMIT_FROM_CLIPBOARD.has(source.tagName) || source.matches(OMIT_CLIPBOARD_SELECTOR)) return null;

  if (source.instanceOf(SVGElement)) {
    return renderedElementPng(source, source.getAttribute("aria-label") || source.getAttribute("title") || "");
  }

  if (source.instanceOf(HTMLCanvasElement)) {
    return renderedElementPng(source, tr("图表"));
  }

  const copy = createEl(source.tagName.toLowerCase() as keyof HTMLElementTagNameMap);
  for (const attribute of [...source.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name === "class" || name === "id" || name === "style" || name === "srcset" || name.startsWith("on") || name.startsWith("data-") || name.startsWith("aria-")) continue;
    if (name === "src" || name === "href") continue;
    copy.setAttribute(attribute.name, attribute.value);
  }
  if (source.instanceOf(HTMLAnchorElement)) {
    const href = source.href;
    if (/^(https?:|mailto:)/i.test(href)) copy.setAttribute("href", href);
  }
  inlineComputedStyles(source, copy);

  if (source.instanceOf(HTMLImageElement)) {
    const src = source.currentSrc || source.getAttribute("src") || "";
    if (/\.svg(?:[?#]|$)/i.test(src) || /^data:image\/svg\+xml/i.test(src)) return renderedElementPng(source, source.alt || "");
    const rect = source.getBoundingClientRect();
    copy.setAttribute("src", await localImageData(plugin, src, imageIndex, rect.width, rect.height) || "");
    copy.setAttribute("alt", source.alt || "");
    copy.setCssStyles({ maxWidth: "100%" });
    copy.setCssStyles({ height: "auto" });
  }

  for (const child of source.childNodes) {
    const cloned = await cloneForRichClipboard(child, plugin, imageIndex, target);
    if (cloned) copy.appendChild(cloned);
  }
  if (target === "wechat" && source.matches(".ibc-container--cols")) {
    copy.setCssStyles({ display: "block" });
    copy.setCssStyles({ width: "100%" });
    for (const child of copy.children) (child as HTMLElement).setCssStyles({ width: "100%" });
  }
  return copy;
}

async function prepareRichCopyMarkup(plugin: IgnorancePlugin, file: TFile, target = "wechat", { cover = true } = {}) {
  return withExportStage(plugin, file, { keepStrip: true, visible: cover }, async (stage, { pages, staging }) => {
    pages.forEach(page => page.remove());
    staging.removeClass("ibp-staging");
    const holder = stage.createDiv({ cls: "ibp-long-sheet" });
    holder.appendChild(staging);
    const imageIndex = vaultImageIndex(plugin);
    const columnLayouts = staging.querySelectorAll(".ibc-container--cols").length;
    const content = createDiv();
    for (const child of staging.childNodes) {
      const clone = await cloneForRichClipboard(child, plugin, imageIndex, target);
      if (clone) content.appendChild(clone);
    }
    const style = getComputedStyle(document.body);
    const root = createDiv();
    root.setCssStyles({ boxSizing: "border-box" });
    root.setCssStyles({ width: "100%" });
    root.setCssStyles({ maxWidth: "100%" });
    root.setCssStyles({ margin: "0 auto" });
    root.style.setProperty("font-family", style.getPropertyValue("--ib-font-sans").trim() || style.fontFamily);
    root.style.setProperty("font-size", getComputedStyle(staging).fontSize);
    root.style.setProperty("line-height", style.getPropertyValue("--ib-text-leading").trim() || getComputedStyle(staging).lineHeight);
    root.style.setProperty("color", style.getPropertyValue("--ib-text-primary").trim() || style.color);
    root.style.setProperty("background-color", style.getPropertyValue("--ib-bg-primary").trim() || "transparent");
    root.setAttribute("data-copy-target", target);
    // A line that ends on a comma or enumeration mark was wrapped by hand, not meant as a break; in a narrow column it leaves a stub line.
    for (const br of Array.from(content.querySelectorAll("br"))) {
      const before = br.previousSibling;
      if (before?.nodeType === Node.TEXT_NODE && /[、，,；;：:]\s*$/.test(before.textContent ?? "")) br.remove();
    }
    root.appendChild(content);
    const html = `<meta charset="utf-8">${root.outerHTML}`;
    const text = staging.innerText.trim();
    return { html, text, target, svgCount: staging.querySelectorAll("svg").length, columnLayouts: target === "wechat" ? columnLayouts : 0 };
  });
}

async function copyFormattedNote(plugin: IgnorancePlugin, file: TFile, target = "wechat") {
  const payload = await prepareRichCopyMarkup(plugin, file, target);
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error(tr("当前设备没有可用的剪贴板接口"));
  // The web clipboard carries rich HTML on desktop and mobile alike.
  await navigator.clipboard.write([new ClipboardItem({
    "text/html": new Blob([payload.html], { type: "text/html" }),
    "text/plain": new Blob([payload.text], { type: "text/plain" })
  })]);
  return payload;
}

// Mobile: no print dialog, so each page becomes a JPEG in an image-only PDF.
async function exportPdfToVault(plugin: IgnorancePlugin, file: TFile) {
  const size = paperSize(plugin.state.page);
  return withExportStage(plugin, file, { visible: true }, async (stage, { pages }) => {
    pages.forEach(p => p.setCssStyles({ display: "none" }));
    const images: Array<{ jpeg: Uint8Array }> = [];
    for (let i = 0; i < pages.length; i += 1) {
      pages[i].setCssStyles({ display: "" });
      images.push({ jpeg: await capturePortable(pages[i], { scale: 2, background: "#FFFFFF", type: "image/jpeg", quality: 0.9 }) });
      pages[i].setCssStyles({ display: "none" });
      await nextFrame();
    }
    return saveExportToVault(plugin, `${file.basename}.pdf`, buildImagePdf(images, { widthMm: size.w, heightMm: size.h }));
  });
}

/* Desktop: the system print dialog, whose "Save as PDF" keeps text as text.
   @page is sized to the paper with margin 0, since each page already carries
   its margins. Returns null: the dialog itself reports where it saved. */
async function exportPdf(plugin: IgnorancePlugin, file: TFile) {
  if (!hasDesktopExports()) return exportPdfToVault(plugin, file);
  const size = paperSize(plugin.state.page);
  await withExportStage(plugin, file, {}, async stage => {
    stage.addClass("ibp-print-root");
    setDocSheet("ibp-print-export", `@media print {
      @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
      html, body { height: auto; overflow: visible; background: #FFFFFF; }
      body > :not(.ibp-print-root) { display: none; }
      /* Obsidian's own print CSS hides every body child without .print. */
      html body > .ibp-print-root { display: block; }
    }`);
    const previousTitle = document.title;
    document.title = file.basename;
    try {
      await nextFrame();
      if (Platform.isDesktop) new Notice(tr("在打印窗口选择「存储为 PDF」即可保存"), 6000);
      window.print();
    } finally {
      if (document.title === file.basename) document.title = previousTitle;
      removeDocSheet("ibp-print-export");
    }
  });
  return null;
}



// Paint the staged pages in-page and write the PNGs into 导出/.
async function exportImages(plugin: IgnorancePlugin, file: TFile, kind: string) {
  return withExportStage(plugin, file, { visible: true, keepStrip: kind === "long" }, async (stage, { pages, staging }) => {
    if (kind === "pages") {
      pages.forEach(p => p.setCssStyles({ display: "none" }));
      const digits = Math.max(2, String(pages.length).length);
      let first = "";
      for (let i = 0; i < pages.length; i += 1) {
        pages[i].setCssStyles({ display: "" });
        const png = await capturePortable(pages[i], { scale: 2 });
        const saved = await saveExportToVault(plugin, `${file.basename}-${String(i + 1).padStart(digits, "0")}.png`, png);
        first ||= saved;
        pages[i].setCssStyles({ display: "none" });
        await nextFrame(); // let taps and the progress notice through between pages
      }
      return tr("{v}（{n} 张）", { v: first.replace(/[^/]+$/, ""), n: pages.length });
    }
    pages.forEach(p => p.remove());
    const sheet = stage.createDiv({ cls: "ibp-long-sheet" });
    staging.removeClass("ibp-staging");
    sheet.appendChild(staging);
    return saveExportToVault(plugin, `${file.basename}.png`, await capturePortable(sheet, { scale: 2 }));
  });
}

/* Exports are written into the vault's 导出/ folder, from where the file can
   be opened, shared or moved with Obsidian's own tools. */
const EXPORT_FOLDER = "导出";

async function saveExportToVault(plugin: IgnorancePlugin, name: string, data: string | Uint8Array) {
  if (plugin.state.exportAsk && Platform.isDesktopApp && !Platform.isMobile) {
    const start = plugin.state.exportLastDir || externalExportDir(plugin) || `${vaultBasePath(plugin)}/${EXPORT_FOLDER}`;
    const target = await askSavePath(start, name);
    if (!target) throw new ExportCancelled(tr("已取消保存"));
    plugin.state.exportLastDir = folderOf(target);
    plugin.saveStoredState();
    return writeAt(target, data);
  }
  const outside = externalExportDir(plugin);
  if (outside) {
    try { return writeOutside(outside, name, data); }
    catch { new Notice(tr("无法写入「{dir}」，已改存到库里的导出文件夹。", { dir: outside })); }
  }
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

// A Mermaid diagram as a PNG data URI.
async function mermaidToPngDataUri(source: string, index: number) {
  // HTML labels (foreignObject) would taint the canvas and block toDataURL.
  const plain = /^\s*%%\{\s*init/.test(source) ? source : `%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n${source}`;
  const { svg } = await renderMermaidForExport(`ibp-word-mermaid-${Date.now()}-${index}`, plain);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const scale = 2;
    const canvas = createEl("canvas");
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

const WORD_IMAGE_LIMIT = 20 * 1024 * 1024;

// Word embeds PNG, JPEG, GIF and BMP as they are; the file's own bytes decide which it is.
function wordImageType(bytes: Uint8Array) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "bmp";
  return "";
}

// WebP, SVG, AVIF…: let the browser decode and re-encode as PNG. An <img> also
// decodes SVG on WebKit, where createImageBitmap rejects it.
async function imageBytesToPng(bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = createEl("canvas");
    canvas.width = image.naturalWidth || 800;
    canvas.height = image.naturalHeight || 600;
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return base64ToBytes(canvas.toDataURL("image/png").split(",")[1]);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function wordImageFromBytes(bytes: Uint8Array, mime: string) {
  if (!bytes.byteLength || bytes.byteLength > WORD_IMAGE_LIMIT) return null;
  const type = wordImageType(bytes);
  if (type) return { type, data: bytes };
  try { return { type: "png", data: await imageBytesToPng(bytes, mime) }; } catch { return null; }
}

async function vaultImageForWord(plugin: IgnorancePlugin, file: TFile, source: string) {
  const dataUri = String(source).match(/^data:(image\/[\w.+-]+);base64,([\s\S]+)$/i);
  if (dataUri) return wordImageFromBytes(base64ToBytes(dataUri[2]), dataUri[1]);
  // Remote pictures the note shows are fetched once, only while exporting.
  if (/^https?:/i.test(source)) {
    try {
      const response = await requestUrl({ url: source, throw: false });
      if (response.status < 200 || response.status >= 300) return null;
      return wordImageFromBytes(new Uint8Array(response.arrayBuffer), String(response.headers["content-type"] || "image/png"));
    } catch {
      return null;
    }
  }
  if (/^mailto:/i.test(source)) return null;
  let clean = String(source).replace(/^<|>$/g, "").split("#")[0];
  try { clean = decodeURIComponent(clean); } catch { /* keep the path as written */ }
  const linked = plugin.app.metadataCache.getFirstLinkpathDest(clean, file.path) || plugin.app.vault.getAbstractFileByPath(clean);
  if (!(linked instanceof TFile)) return null;
  const extension = linked.extension.toLowerCase();
  const mime = extension === "svg" ? "image/svg+xml" : `image/${extension === "jpg" ? "jpeg" : extension}`;
  return wordImageFromBytes(new Uint8Array(await plugin.app.vault.readBinary(linked)), mime);
}

async function exportWord(plugin: IgnorancePlugin, file: TFile, combined?: { text: string; title: string }) {
  const text = combined?.text ?? await plugin.app.vault.cachedRead(file);
  const diagrams: string[] = [];
  let missingImages = 0;
  // Same fences, in the same order, as prepareMarkdownTextForPandoc replaces.
  const fences = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)];
  for (const [index, fence] of fences.entries()) {
    try { diagrams.push(await mermaidToPngDataUri(fence[1], index)); } catch { diagrams.push(""); }
  }
  const markdown = await prepareMarkdownTextForPandoc(text, diagrams, async (target: string) => {
    const clean = decodeURIComponent(target.split("#")[0].split("|")[0]);
    return plugin.app.metadataCache.getFirstLinkpathDest(clean, file.path)?.path || clean;
  });
  const bodyStyle = getComputedStyle(document.body);
  const { createStructuredDocxBuffer } = await loadChunk("chunk-docx.cjs");
  const bytes = await createStructuredDocxBuffer(markdown, {
    title: combined?.title ?? file.basename,
    style: {
      ...wordExportFonts(plugin.state.wordFont, {
        text: bodyStyle.getPropertyValue("--font-text") || bodyStyle.getPropertyValue("--ib-font-sans"),
        heading: bodyStyle.getPropertyValue("--ib-font-heading") || bodyStyle.getPropertyValue("--font-text")
      }),
      codeFamily: wordFontFromToken(bodyStyle.getPropertyValue("--ib-font-mono"), "Consolas")
    },
    resolveImage: async (source: string) => {
      const image = await vaultImageForWord(plugin, file, source);
      if (!image) missingImages += 1;
      return image;
    }
  });
  const failedDiagrams = diagrams.filter(png => !png).length;
  if (missingImages || failedDiagrams) {
    new Notice([missingImages && tr("{missingImages} 张图片没能放进文档", { missingImages }), failedDiagrams && tr("{failedDiagrams} 个 Mermaid 图表渲染失败", { failedDiagrams })].filter(Boolean).join(tr("，")) + tr("，Word 里留下的是替代文字或源码。"), 10000);
  }
  return saveExportToVault(plugin, `${combined?.title ?? file.basename}.docx`, bytes);
}


export {
  openExportMenu,
  addPortableExportItems,
  runExport,
  pageVarsAtFullScale,
  withExportStage,
  exportPdf,
  nextFrame,
  exportImages,
  exportWord,
  saveExportToVault,
  prepareRichCopyMarkup,
  copyFormattedNote,
  CLIPBOARD_STYLE_PROPERTIES,
  clipboardImageMime,
  resourcePathKey,
  vaultImageIndex
};
