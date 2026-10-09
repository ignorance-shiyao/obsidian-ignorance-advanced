import { loadLanguageIcons } from "./language-icons.js";
import { snapshotSvgPaints, svgPaintTokens } from "./svg-export-paints.js";
import { renderBudget } from "./render-budget.js";
import { readerPreferenceId } from "./reader-preferences.js";
import { applyAppearancePreferences } from "./appearance.js";
import { THEME_TOKEN_NAMES } from "./theme-presets.js";
import { buildCover } from "./reader-cover.js";
import { headerMarkup, indexContent, navigationMarkup, overlayMarkup, railMarkup, readerAppCss, readerAppScript } from "./reader-app.js";
import { electronRemote, hasDesktopExports } from "./desktop-runtime.js";
import { bytesToBase64 } from "./bytes.js";
import {
  CLIPBOARD_STYLE_PROPERTIES,
  captureElement,
  clipboardImageMime,
  nextFrame,
  resourcePathKey,
  vaultImageIndex,
  withExportStage,
  saveExportToVault
} from "./export.js";

const OMIT_FROM_HTML = new Set(["SCRIPT", "STYLE", "BUTTON", "TEXTAREA", "SELECT", "IFRAME", "OBJECT", "EMBED", "SOURCE", "META", "LINK", "BASE", "FORM"]);
const OMIT_HTML_SELECTOR = ".ibm-block-header, .ibm-mermaid-toolbar, .ibp-page-number, .ib-table-resize-layer, .ibt-layer, .ib-image-actions, .ib-image-resize-layer, .copy-button";
const COLOR_PROPERTIES = new Set([
  "color", "background-color", "border-color", "outline-color", "text-decoration-color",
  "fill", "stroke", "stop-color", "flood-color", "lighting-color"
]);
const BORDER_SHORTHANDS = new Set(["border", "border-top", "border-right", "border-bottom", "border-left"]);
const HTML_STYLE_PROPERTIES = [
  ...CLIPBOARD_STYLE_PROPERTIES.filter(name => !BORDER_SHORTHANDS.has(name)),
  "border-style", "border-width", "border-color", "outline-color", "outline-style", "outline-width", "outline-offset", "text-decoration-color", "caption-side",
  "text-anchor", "dominant-baseline", "shape-rendering", "vector-effect", "paint-order",
  "marker-start", "marker-mid", "marker-end", "stroke-dashoffset", "fill-rule", "clip-rule"
];
const SVG_STYLE_PROPERTIES = [...HTML_STYLE_PROPERTIES, "rx", "ry"];

async function setBodyThemeMode(plugin, mode, root, signal) {
  const body = document.body;
  body.toggleClass("theme-dark", mode === "dark");
  body.toggleClass("theme-light", mode === "light");
  applyAppearancePreferences(plugin);
  await nextFrame();
  const started = performance.now();
  while (root.querySelector('.ib-echarts-block[data-ib-echarts-state="loading"]') && performance.now() - started < 5000) {
    signal?.throwIfAborted();
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

function snapshotThemeTokens() {
  const body = document.body;
  const bodyStyle = getComputedStyle(body);
  const values = {};
  // Interaction tokens come from the theme, independent of static capture.
  for (const name of [
    "--ib-dur-fast", "--ib-dur-base", "--ib-dur-slow", "--ib-ease-out", "--ib-ease-in",
    "--ib-font-serif", "--ib-font-sans", "--ib-font-heading", "--ib-heading-bold", "--ib-quote-size",
    "--font-text", "--font-text-override", "--font-interface", "--font-monospace", "--font-text-size", "--line-height-normal",
    "--ib-quote-leading", "--ib-quote-mark-size", "--ib-quote-mark-opacity",
    "--ib-quote-rail-width", "--ib-quote-inset", "--ib-space-2", "--ib-space-4",
    "--ib-space-5", "--ib-radius-xs", "--ib-tiny-size", "--ib-tiny-leading",
    "--ib-table-radius", "--ib-table-heading-size", "--ib-table-caption-size", "--ib-callout-radius",
    "--ib-callout-heading-size", "--ib-callout-text-size", "--ib-callout-leading",
    "--ib-code-radius", "--ib-code-header-height", "--ib-code-label-size", "--ib-code-text-size", "--ib-code-leading",
    "--ib-code-highlight-radius", "--ib-task-radius", "--ib-key-radius",
    "--ib-key-size", "--ib-definition-size", "--ib-definition-leading",
    "--ib-chapter-rail-purple", "--ib-chapter-rail-cyan",
    "--ib-border-1", "--ib-bg-secondary", "--ib-font-mono",
    "--ib-highlight-yellow-bg", "--ib-highlight-yellow-text",
    "--ib-highlight-blue-bg", "--ib-highlight-blue-text",
    "--ib-footnote-size", "--ib-footnote-leading", "--ib-details-radius",
    "--ib-details-title-size", "--ib-space-3"
  ]) {
    const value = bodyStyle.getPropertyValue(name).trim();
    if (value) values[name] = value;
  }
  const colors = new Map();
  const probe = document.createElement("span");
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  body.appendChild(probe);
  for (const name of [...THEME_TOKEN_NAMES, "--ib-table-heading-bg", "--ib-table-stripe-bg", ...["keyword", "string", "number", "function", "property", "comment", "operator", "punctuation", "variable", "type"].map(kind => `--ib-syntax-${kind}`), ...["info", "success", "warning", "error"].flatMap(kind => ["text", "icon", "bg", "border"].map(part => `--ib-${kind}-${part}`))]) {
    const value = bodyStyle.getPropertyValue(name).trim();
    if (!value) continue;
    values[name] = value;
    probe.style.color = `var(${name})`;
    const computed = getComputedStyle(probe).color;
    if (computed && computed !== "rgba(0, 0, 0, 0)") colors.set(computed, name);
  }
  probe.remove();
  return { values, colors };
}

// Measured sizes pin a block to the width it had on the export page, so the
// reader could neither center nor resize it. Keep them only on media.
const SIZE_PROPERTIES = new Set(["width", "min-width", "max-width", "height", "max-height"]);
const SIZED_ELEMENTS = new Set(["IMG", "SVG", "CANVAS", "VIDEO", "IFRAME", "svg"]);

// Values that equal what the element gets with no style at all: CSS initial
// values the browser's own stylesheet does not override for that element.
// Writing them onto every element was most of the exported file.
const DEFAULT_VALUES = {
  "grid-template-columns": "none", "grid-template-rows": "none", "grid-area": "auto",
  "justify-content": "normal", "align-items": "normal", "column-count": "auto", "object-fit": "fill",
  "flex": "0 1 auto", "flex-flow": "row", "gap": "normal", "filter": "none", "opacity": "1",
  "vector-effect": "none", "border-radius": "0px", "text-decoration-thickness": "initial",
  "text-decoration-style": "initial", "paint-order": "normal", "shape-rendering": "auto",
  "marker": "none", "marker-start": "none", "marker-mid": "none", "marker-end": "none"
};
const UA_DECORATED = new Set(["A", "INS", "U", "S", "DEL", "STRIKE"]);
const UA_BACKGROUND = new Set(["MARK", "TH", "TD", "TR", "THEAD", "TBODY", "TABLE", "CODE", "PRE", "KBD"]);
const UA_VERTICAL_ALIGN = new Set(["TD", "TH", "TR", "THEAD", "TBODY", "TFOOT", "SUB", "SUP", "IMG", "svg"]);

function isDefaultValue(name, value, source, computed) {
  if (DEFAULT_VALUES[name] === value) return true;
  const tag = source.tagName;
  switch (name) {
    case "outline-color": return computed.outlineStyle === "none";
    case "text-decoration-line": return value === "none" && !UA_DECORATED.has(tag);
    case "text-decoration-color": return computed.textDecorationLine === "none" && !UA_DECORATED.has(tag);
    case "background-color": return value === "rgba(0, 0, 0, 0)" && !UA_BACKGROUND.has(tag);
    case "vertical-align": return value === "baseline" && !UA_VERTICAL_ALIGN.has(tag);
    case "border-style": case "border-width": case "border-color":
      return computed.borderStyle === "none" && tag !== "HR" && tag !== "TABLE";
    default: return false;
  }
}

function inlineStandaloneStyles(source, target, colors) {
  const computed = getComputedStyle(source);
  const sized = SIZED_ELEMENTS.has(source.tagName);
  const diagramPaints = colors.diagramPaints?.get(source);
  // The cloned diagram has no source stylesheet, so browser defaults can be
  // omitted there too instead of repeating them on every SVG path and label.
  for (const name of source instanceof SVGElement ? SVG_STYLE_PROPERTIES : HTML_STYLE_PROPERTIES) {
    if (!sized && SIZE_PROPERTIES.has(name)) continue;
    let value = computed.getPropertyValue(name);
    const diagramToken = diagramPaints?.get(name);
    if (!value || isDefaultValue(name, value, source, computed)) continue;
    if (["rx", "ry"].includes(name) && value === "auto" && !diagramToken) continue;
    if (name === "box-sizing" && value === "border-box") continue; // reader CSS sets this globally
    // Grid tracks resolve to pixels; share the reader's width instead.
    if (name === "grid-template-columns" && /^(\s*[\d.]+px)+\s*$/.test(value)) {
      // …and wrap on narrow screens (phones) instead of squeezing every column.
      value = `repeat(auto-fit, minmax(min(100%, 140px), 1fr))`;
    }
    const token = diagramToken || (COLOR_PROPERTIES.has(name) ? colors.get(value.trim()) : null);
    target.style.setProperty(name, token ? `var(${token})` : value);
  }
}

function safeAttribute(name, value) {
  if (/^on/i.test(name) || name === "style" || name === "srcset" || name.startsWith("data-") || name.startsWith("aria-")) return false;
  if (name === "href" || name === "xlink:href") return /^(?:#|https?:\/\/|mailto:)/i.test(value);
  if (name === "src") return /^data:image\//i.test(value);
  return true;
}

function decodeHash(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function copyAttributes(source, target, headingIds) {
  for (const attribute of [...source.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name === "class" || name === "style" || name === "src" || name === "id" || !safeAttribute(name, attribute.value)) continue;
    if (name === "href" && source instanceof HTMLAnchorElement) {
      const value = attribute.value;
      if (value.startsWith("#")) {
        const mapped = headingIds.get(decodeHash(value.slice(1)));
        if (mapped) target.setAttribute("href", `#${mapped}`);
      } else if (/^(?:https?:\/\/|mailto:)/i.test(value)) target.setAttribute("href", source.href);
      continue;
    }
    target.setAttribute(attribute.name, attribute.value);
  }
}

async function cloneSvgNode(source, colors, checkpoint) {
  await checkpoint();
  if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.nodeValue || "");
  if (!(source instanceof Element) || ["SCRIPT", "STYLE"].includes(source.tagName.toUpperCase())) return null;
  const clone = document.createElementNS(source.namespaceURI || "http://www.w3.org/2000/svg", source.tagName.toLowerCase());
  for (const attribute of [...source.attributes]) {
    const name = attribute.name.toLowerCase();
    if (/^on/i.test(name) || name === "style") continue;
    if (name === "src" && !/^data:image\//i.test(attribute.value)) continue;
    if ((name === "href" || name === "xlink:href") && !/^(?:#|data:image\/)/i.test(attribute.value)) continue;
    clone.setAttribute(attribute.name, attribute.value);
  }
  inlineStandaloneStyles(source, clone, colors);
  for (const child of source.childNodes) {
    const copy = await cloneSvgNode(child, colors, checkpoint);
    if (copy) clone.appendChild(copy);
  }
  return clone;
}

async function imageAsPng(source, colors, alt = "") {
  const rect = source.getBoundingClientRect();
  const image = document.createElement("img");
  if (hasDesktopExports()) {
    image.src = `data:image/png;base64,${bytesToBase64(await captureElement(source))}`;
  } else if (source instanceof HTMLCanvasElement) {
    // Mobile has no page capture; a chart canvas can export itself.
    image.src = source.toDataURL("image/png");
  } else {
    image.src = source.currentSrc || source.getAttribute("src") || "";
  }
  image.alt = alt;
  inlineStandaloneStyles(source, image, colors);
  if (rect.width > 0) image.style.width = `${Math.ceil(rect.width)}px`;
  if (rect.height > 0) image.style.height = "auto";
  image.style.maxWidth = "100%";
  return image;
}

const READER_CHART_SELECTOR = ".mermaid, .ibm-mermaid-enhanced, .ib-echarts-block, .block-language-mermaid";

async function remoteImageDataUri(source) {
  const src = source.currentSrc || source.getAttribute("src") || "";
  if (!/^https?:/i.test(src)) return null;
  try {
    const { requestUrl } = require("obsidian");
    const response = await requestUrl({ url: src });
    const type = String(response.headers?.["content-type"] || "").split(";")[0];
    if (!type.startsWith("image/")) return null;
    return `data:${type};base64,${bytesToBase64(new Uint8Array(response.arrayBuffer))}`;
  } catch (_) {
    return null;
  }
}

async function imageDataUri(plugin, source, imageIndex) {
  const src = source.currentSrc || source.getAttribute("src") || "";
  if (/^data:image\//i.test(src)) return src;
  const file = imageIndex.get(src) || imageIndex.get(resourcePathKey(src));
  if (file) {
    const mime = clipboardImageMime(file.path);
    if (!mime.startsWith("image/")) return null;
    return `data:${mime};base64,${bytesToBase64(await plugin.app.vault.readBinary(file))}`;
  }
  return null;
}

async function cloneHtmlNode(source, plugin, imageIndex, colors, headingIds, checkpoint, preview = false) {
  await checkpoint();
  if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.nodeValue || "");
  if (!(source instanceof Element) || OMIT_FROM_HTML.has(source.tagName) || source.matches(OMIT_HTML_SELECTOR)) return null;

  if (source instanceof HTMLInputElement) {
    if (source.type !== "checkbox") return null;
    // A drawn box instead of ☑/☐ glyphs: the glyphs sat on the captured
    // checkbox fill and read as a black blob.
    const checkbox = document.createElement("span");
    inlineStandaloneStyles(source, checkbox, colors);
    const size = Math.round(source.getBoundingClientRect().height) || 16;
    checkbox.className = "ib-task-box";
    checkbox.setAttribute("role", "img");
    checkbox.setAttribute("aria-label", source.checked ? "已完成" : "未完成");
    if (source.checked) checkbox.dataset.checked = "";
    Object.assign(checkbox.style, { display: "inline-flex", alignItems: "center", justifyContent: "center", width: `${size}px`, height: `${size}px`, verticalAlign: "-0.15em", fontSize: "0", lineHeight: "0" });
    if (source.checked) checkbox.innerHTML = '<svg viewBox="0 0 16 16" width="72%" height="72%" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return checkbox;
  }

  if (source instanceof SVGElement) {
    const svg = await cloneSvgNode(source, colors, checkpoint);
    svg?.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    if (svg) {
      // ECharts' SVG renderer sets only width/height. Once max-width or
      // max-height shrink the box, a viewBox-less SVG is cropped instead of scaled.
      const width = parseFloat(svg.getAttribute("width") || "");
      const height = parseFloat(svg.getAttribute("height") || "");
      if (!svg.hasAttribute("viewBox") && width > 0 && height > 0) svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      svg.style.maxWidth = "100%";
      svg.style.maxHeight = source.closest(".is-long-diagram") ? "none" : "min(148.5mm, 72vh)";
      svg.style.width = "auto";
      svg.style.height = "auto";
      svg.style.display = "block";
      svg.style.marginInline = "auto";
    }
    return svg;
  }
  if (source instanceof HTMLCanvasElement) return imageAsPng(source, colors, "图表");
  // Export the chart itself, rather than the interactive zoom/scroll scaffolding.
  // Preserve the authored block position with auto margins at every reader width.
  if (source.matches(".mermaid.ibm-mermaid-enhanced,.ib-echarts-block")) {
    const graphic = source.querySelector(".ibm-mermaid-canvas > svg,.ib-echarts-host svg,.ib-echarts-host canvas");
    if (graphic) {
      const frame = document.createElement("div");
      inlineStandaloneStyles(source, frame, colors);
      const align = source.getAttribute("data-ib-chart-align") || "center";
      frame.setAttribute("data-reader-chart", "");
      frame.setAttribute("data-ib-chart-align", align);
      Object.assign(frame.style, { display:"block", position:"relative", height:"auto", minHeight:"0", overflow:"visible", padding:"8px", boxSizing:"border-box", width:`${Math.round(source.getBoundingClientRect().width)}px`, maxWidth:"100%", marginLeft:align === "left" ? "0" : "auto", marginRight:align === "right" ? "0" : "auto" });
      const chart = await cloneHtmlNode(graphic, plugin, imageIndex, colors, headingIds, checkpoint, preview);
      if (chart) frame.appendChild(chart);
      return frame;
    }
  }


  if (source instanceof HTMLImageElement) {
    if (preview && /^https?:/i.test(source.currentSrc || source.src)) {
      const image = document.createElement("img");
      image.src = source.currentSrc || source.src;
      image.alt = source.alt || "";
      image.loading = "lazy";
      inlineStandaloneStyles(source, image, colors);
      image.style.maxWidth = "100%";
      image.style.height = "auto";
      return image;
    }
    const data = await imageDataUri(plugin, source, imageIndex);
    if (data) {
      const image = document.createElement("img");
      image.src = data;
      image.alt = source.alt || "";
      inlineStandaloneStyles(source, image, colors);
      image.style.maxWidth = "100%";
      image.style.height = "auto";
      return image;
    }
    // Remote images: download and inline them. Capturing the page is the last
    // resort — Chromium refuses (UnknownVizError) for images far down a long
    // staged note, which used to abort the whole export.
    const remote = await remoteImageDataUri(source);
    if (remote) {
      const image = document.createElement("img");
      image.src = remote;
      image.alt = source.alt || "";
      inlineStandaloneStyles(source, image, colors);
      image.style.maxWidth = "100%";
      image.style.height = "auto";
      return image;
    }
    if (source.complete && source.naturalWidth > 0) {
      try { return await imageAsPng(source, colors, source.alt || ""); } catch (error) { console.warn("Ignorance Advanced: image capture failed —", error); }
      const linked = document.createElement("img");
      linked.src = source.currentSrc || source.getAttribute("src") || "";
      linked.alt = source.alt || "";
      linked.style.maxWidth = "100%";
      return linked;
    }
    const fallback = document.createElement("span");
    fallback.textContent = source.alt || "[无法嵌入的图片]";
    return fallback;
  }

  const copy = document.createElement(source.tagName.toLowerCase());
  copyAttributes(source, copy, headingIds);
  inlineStandaloneStyles(source, copy, colors);
  for (const name of ["data-ib-table-align", "data-ib-chart-align"]) {
    const value = source.getAttribute(name);
    if (["left", "center", "right"].includes(value)) copy.setAttribute(name, value);
  }
  if (source.tagName === "A" && source.classList.contains("is-unresolved")) copy.setAttribute("data-ib-link-broken", "");
  if (/^fn(?:ref)?[-:]/.test(source.id)) copy.id = headingIds.get(source.id) || "";
  if (source.classList.contains("ibc-container--chapter")) {
    copy.setAttribute("data-ib-chapter", "");
    copy.setAttribute("data-ib-chapter-tone", source.dataset.ibcTone || "0");
    copy.style.position = "relative";
  }
  if (source.classList.contains("ibc-chapter__rail")) {
    copy.setAttribute("data-ib-chapter-rail", "");
    const style = getComputedStyle(source);
    for (const property of ["position", "top", "inset-inline-start", "width", "height", "pointer-events"])
      copy.style.setProperty(property, style.getPropertyValue(property));
    copy.setAttribute("aria-hidden", "true");
  }
  if (source.classList.contains("ibm-toc")) copy.setAttribute("data-ib-toc", "");
  if (source.classList.contains("ibm-toc-title")) copy.setAttribute("data-ib-toc-title", "");
  if (source.classList.contains("footnotes")) copy.setAttribute("data-ib-footnotes", "");
  if (/^H[1-6]$/.test(source.tagName)) copy.id = headingIds.get(source.id) || "";
  // Classes are dropped with the styles inlined; keep what the reader's
  // navigation center needs to find diagrams.
  if (source.matches(READER_CHART_SELECTOR) && !source.parentElement?.closest(READER_CHART_SELECTOR)) copy.setAttribute("data-reader-chart", "");
  if (source.classList.contains("ib-code-line")) copy.setAttribute("data-ib-line", source.getAttribute("data-highlighted") === "true" ? "hl" : "");
  if (source.classList.contains("callout")) {
    copy.setAttribute("data-ib-callout", (source.getAttribute("data-callout") || "note").toLowerCase());
    if (source.classList.contains("is-collapsible")) copy.setAttribute("data-ib-collapsed", String(source.classList.contains("is-collapsed")));
  }
  if (source.classList.contains("callout-title")) copy.setAttribute("data-ib-callout-title", "");
  if (source.classList.contains("callout-content")) { copy.setAttribute("data-ib-callout-content", ""); copy.style.removeProperty("display"); }
  if (source.classList.contains("callout-fold")) copy.setAttribute("data-ib-callout-fold", "");
  // Syntax token kinds, so a reader skin can recolor code (e.g. on a dark code frame).
  if (source.classList.contains("token") && source.closest("pre")) {
    copy.setAttribute("data-tk", [...source.classList].filter(name => name !== "token").join(" "));
  }
  if (source.tagName === "PRE") {
    const language = (source.className + " " + (source.querySelector("code")?.className || "")).match(/language-([\w+#-]+)/)?.[1];
    if (language) copy.setAttribute("data-lang", language);
  }
  for (const child of source.childNodes) {
    const cloned = await cloneHtmlNode(child, plugin, imageIndex, colors, headingIds, checkpoint, preview);
    if (cloned) copy.appendChild(cloned);
  }
  return copy;
}

// Inherited properties an element would get from its parent anyway. Every
// element carried the full computed set (a long font stack each time), which
// made a 120 KB note export as ~20 MB of HTML.
const INHERITED_PROPERTIES = [
  "color", "font-family", "font-size", "font-style", "font-weight", "font-variant", "line-height",
  "letter-spacing", "word-spacing", "text-align", "text-indent", "text-transform", "white-space",
  "word-break", "overflow-wrap", "list-style-type", "list-style-position", "visibility", "direction",
  "border-collapse", "border-spacing",
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "clip-rule", "text-anchor",
  "dominant-baseline", "shape-rendering", "paint-order", "marker", "marker-start", "marker-mid", "marker-end"
];
// The reader wraps these in frames of its own at runtime; they keep their full set.
const KEEP_FULL_STYLE = new Set(["TABLE", "PRE", "IMG", "FIGURE", "svg", "SVG"]);


async function dropInheritedDuplicates(root, checkpoint) {
  // Children first, while each parent still holds the values they compare to.
  const visit = async element => {
    await checkpoint();
    // Diagram styles have been removed during cloning; identical inherited
    // SVG values can safely come from their parent just like HTML text.
    for (const child of element.children) await visit(child);
    const parent = element.parentElement;
    if (!parent || parent === root || element === root || KEEP_FULL_STYLE.has(element.tagName)) return;
    const own = element.style, inherited = parent.style;
    for (const name of INHERITED_PROPERTIES) {
      // These elements have a UA font instead of inheriting their parent's.
      // Removing an equal declaration from <code> changes the rendered face.
      if (name === "font-family" && ["CODE", "KBD", "SAMP"].includes(element.tagName)) continue;
      const value = own.getPropertyValue(name);
      if (value && value === inherited.getPropertyValue(name) && own.getPropertyPriority(name) === inherited.getPropertyPriority(name)) own.removeProperty(name);
    }
  };
  for (const child of root.children) await visit(child);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char]);
}

function tokenDeclarations(snapshot) {
  return Object.entries(snapshot.values).map(([name, value]) => `${name}:${value}`).join(";");
}

function readerThemeCss() {
  // Transfer only offline-reader rules; keep theme CSS as their source.
  const readerSelector = /\.ib-(?:reader|nav|toc|code-frame|tool|dock)(?:[-\s.:[#]|$)/;
  const collect = rules => [...rules].map(rule => {
    if (rule.selectorText) return readerSelector.test(rule.selectorText) ? rule.cssText : "";
      if (["ib-copy-confirm", "ib-callout-open", "ib-callout-close"].includes(rule.name)) return rule.cssText;
    if (rule.cssRules && rule.conditionText) {
      const nested = collect(rule.cssRules);
      return nested ? rule.cssText.slice(0, rule.cssText.indexOf("{")) + "{" + nested + "}" : "";
    }
    return "";
  }).filter(Boolean).join("\n");
  return [...document.styleSheets].map(sheet => {
    try { return collect(sheet.cssRules); } catch (_) { return ""; }
  }).filter(Boolean).join("\n");
}

function buildReaderCss(light, dark) {
  return `
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; color-scheme: light; background: ${light.values["--ib-bg-primary"] || "#fff"}; }
    html[data-ib-theme="dark"] { color-scheme: dark; background: ${dark.values["--ib-bg-primary"] || "#111"}; }
    body { margin: 0; }
    .ib-reader { --ib-bg-primary:#fff; --ib-bg-secondary:#f5f6f8; --ib-text-primary:#202633; --ib-text-secondary:#5d6676; --ib-border-default:#dce1e8; min-height:100vh; color:var(--ib-text-primary); background:var(--ib-bg-primary); font-family:var(--font-interface,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif); color-scheme:light; }
    .ib-reader[data-theme="light"] { color-scheme:light; ${tokenDeclarations(light)} }
    .ib-reader[data-theme="dark"] { color-scheme:dark; ${tokenDeclarations(dark)} }
    .ib-reader-header { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:12px; min-height:56px; padding:8px 20px; border-bottom:1px solid var(--ib-border-default); background:var(--ib-bg-chrome,var(--ib-bg-secondary)); }
    .ib-reader-title { flex:1; min-width:0; overflow:hidden; color:var(--ib-text-primary); font-size:15px; font-weight:600; text-overflow:ellipsis; white-space:nowrap; }
    .ib-reader-button { border:1px solid var(--ib-border-default); border-radius:8px; padding:7px 11px; color:var(--ib-text-primary); background:var(--ib-bg-primary); font:inherit; cursor:pointer; }
    .ib-reader-button:hover { background:var(--ib-bg-hover,var(--ib-bg-secondary)); }
    .ib-reader-layout { display:grid; grid-template-columns:260px minmax(0,1fr); min-height:calc(100vh - 56px); max-width:1500px; margin:0 auto; }
    .ib-reader-toc { position:sticky; top:56px; align-self:start; height:calc(100vh - 56px); overflow:auto; padding:24px 14px 28px 22px; border-right:1px solid var(--ib-border-default); background:var(--ib-bg-secondary); }
    .ib-reader-toc-title { margin:0 0 12px; color:var(--ib-text-primary); font-size:13px; font-weight:700; }
    .ib-reader-toc nav { display:grid; gap:3px; }
    .ib-reader-toc a { display:block; overflow:hidden; border-radius:6px; padding:6px 8px; color:var(--ib-text-secondary); font-size:13px; line-height:1.45; text-decoration:none; text-overflow:ellipsis; }
    .ib-reader-toc a[data-level="1"] { font-weight:650; }
    .ib-reader-toc a[data-level="3"], .ib-reader-toc a[data-level="4"], .ib-reader-toc a[data-level="5"], .ib-reader-toc a[data-level="6"] { padding-left:20px; }
    .ib-reader-toc a:hover, .ib-reader-toc a[aria-current="location"] { color:var(--ib-text-accent,var(--ib-accent-brand)); background:var(--ib-bg-active,var(--ib-bg-hover)); }
    .ib-reader-main { min-width:0; padding:36px clamp(18px,5vw,72px) 80px; }
    .ib-reader-note { max-width:var(--ib-reader-width,820px); margin:0 auto; color:var(--ib-text-primary); }
    .ib-reader[data-width="narrow"] { --ib-reader-width:680px; }
    .ib-reader[data-width="wide"] { --ib-reader-width:1080px; }
    .ib-reader[data-width="full"] { --ib-reader-width:none; }
    .ib-reader[data-width="full"] .ib-reader-layout { max-width:none; }
    .ib-reader-width { border:1px solid var(--ib-border-default); border-radius:8px; padding:6px 8px; color:var(--ib-text-primary); background:var(--ib-bg-primary); font:inherit; font-size:14px; cursor:pointer; }
    .ib-reader-note img, .ib-reader-note svg { max-width:100%; }
    .ib-reader-note h1, .ib-reader-note h2, .ib-reader-note h3, .ib-reader-note h4, .ib-reader-note h5, .ib-reader-note h6 { scroll-margin-top:72px; }
    .ib-reader-note pre { max-width:100%; overflow:auto; }
    .ib-reader-note table { max-width:100%; }
    .ib-reader-empty { padding:12px; color:var(--ib-text-muted,var(--ib-text-secondary)); font-size:13px; }
    .ib-reader-toc-hidden .ib-reader-layout { grid-template-columns:0 minmax(0,1fr); }
    .ib-reader-toc-hidden .ib-reader-toc { visibility:hidden; padding:0; border:0; }
    @media (max-width:760px) {
      .ib-reader-width { display:none; }
      .ib-reader-layout { display:block; }
      .ib-reader-toc { position:fixed; top:56px; bottom:0; left:0; z-index:18; width:min(82vw,310px); height:auto; box-shadow:0 12px 32px rgba(0,0,0,.16); transform:translateX(-105%); transition:transform var(--ib-dur-base) var(--ib-ease-out); }
      .ib-reader-toc-open .ib-reader-toc { visibility:visible; transform:translateX(0); }
      .ib-reader-toc-hidden .ib-reader-toc { padding:24px 14px 28px 22px; border-right:1px solid var(--ib-border-default); }
      .ib-reader-main { padding:24px 16px 56px; }
      .ib-reader-header { padding:8px 12px; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } *, *::before, *::after { transition-duration:0ms !important; animation-duration:0ms !important; } }
    ${readerAppCss()}
    ${readerThemeCss()}
  `;
}

async function buildHtmlReader(plugin, file, content, sourceHeadings, headingIds, light, dark, initialMode, checkpoint, preferenceId) {
    await dropInheritedDuplicates(content, checkpoint);
    // The cover shows the title; a first H1 that only repeats it is hidden and left out of the navigation.
    const { cover, colophon, title } = await buildCover(plugin, file, content);
    const headings = [...content.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    const toc = headings.map((heading, index) => {
      const id = `reader-section-${index + 1}`;
      heading.id = id;
      const original = sourceHeadings[index];
      if (original?.id) headingIds.set(original.id, id);
      const label = heading.textContent.trim() || `章节 ${index + 1}`;
      const level = heading.tagName.slice(1);
      if (heading.hasAttribute("data-reader-duplicate-title")) return "";
      heading.setAttribute("data-reader-section", String(index + 1));
      return `<a href="#${id}" data-level="${level}">${escapeHtml(label)}</a>`;
    }).join("");
    const lists = indexContent(content);
    const html = `<!doctype html>
<html lang="zh-CN" data-export="ignorance-reader" data-ib-theme="${initialMode}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${escapeHtml(title)}</title><style>${buildReaderCss(light, dark)}</style></head>
<body data-ib-table-alignment="${["left", "center", "right"].includes(plugin.state.appearance?.tableAlignment) ? plugin.state.appearance.tableAlignment : "left"}"><div class="ib-reader${toc ? "" : " ib-reader-toc-hidden"}" data-theme="${initialMode}" data-preference-id="${preferenceId}" data-width="standard" data-font="theme" data-skin="theme"><script data-ib-early>(function(){var s=document.currentScript.parentNode,t=null;try{t=localStorage.getItem("ib-reader-"+(s.dataset.preferenceId?s.dataset.preferenceId+"-":"")+"theme")}catch(e){}if(t==="light"||t==="dark")s.dataset.theme=t;document.documentElement.dataset.ibTheme=s.dataset.theme})()</script>
  ${headerMarkup(title)}
  <div class="ib-reader-layout">${navigationMarkup(toc, lists)}<main class="ib-reader-main"><article class="ib-reader-note">${cover}${content.innerHTML}${colophon}</article></main>${railMarkup()}</div>
  ${overlayMarkup()}
</div><script>${readerAppScript()}</script></body></html>`;
    return html;
}

/* `cover` hides the window behind the stage while the theme is switched to
   read both palettes; the preview window covers it itself, and a full-screen
   stage over it made the preview look like a frozen white screen. */
async function prepareHtmlDocument(plugin, file, { cover = true, onProgress = null, signal = null } = {}) {
  // The reader inlines language icons into each code header, so they must be loaded first.
  await loadLanguageIcons(plugin).catch(() => {});
  const checkpoint = renderBudget(signal);
  const initialMode = document.body.hasClass("theme-dark") ? "dark" : "light";
  const preferenceId = readerPreferenceId(file.path, initialMode, snapshotThemeTokens().values);
  const progress = onProgress ? async ({ staging }) => {
    signal?.throwIfAborted();
    const light = snapshotThemeTokens();
    const sourceHeadings = [...staging.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    const headingIds = new Map(sourceHeadings.filter(h => h.id).map((h, i) => [h.id, `reader-section-${i + 1}`]));
    [...staging.querySelectorAll('[id^="fn-"] , [id^="fnref-"]')].forEach((node, i) => headingIds.set(node.id, `reader-footnote-${i + 1}`));
    const content = document.createElement("div");
    const imageIndex = vaultImageIndex(plugin);
    for (const child of staging.childNodes) {
      const cloned = await cloneHtmlNode(child, plugin, imageIndex, light.colors, headingIds, checkpoint, true);
      if (cloned) content.appendChild(cloned);
    }
    await onProgress(await buildHtmlReader(plugin, file, content, sourceHeadings, headingIds, light, light, initialMode, checkpoint, preferenceId));
  } : null;
  return withExportStage(plugin, file, { keepStrip: true, visible: cover, onProgress: progress, signal }, async (stage, { pages, staging }) => {
    pages.forEach(page => page.remove());
    staging.removeClass("ibp-staging");
    const holder = stage.createDiv({ cls: "ibp-long-sheet" });
    holder.appendChild(staging);

    // The stage starts in the app's mode and the clone below must be taken in
    // light. A dark app reads dark first and switches once; a light app reads
    // light, visits dark and returns. Each switch re-renders every chart.
    let light, dark, darkPaints, lightPaints;
    if (initialMode === "dark") {
      await setBodyThemeMode(plugin, "dark", staging, signal);
      await nextFrame();
      signal?.throwIfAborted();
      dark = snapshotThemeTokens();
      darkPaints = await snapshotSvgPaints(staging, checkpoint);
      await setBodyThemeMode(plugin, "light", staging, signal);
      await nextFrame();
      signal?.throwIfAborted();
      light = snapshotThemeTokens();
      lightPaints = await snapshotSvgPaints(staging, checkpoint);
    } else {
      await setBodyThemeMode(plugin, "light", staging, signal);
      await nextFrame();
      signal?.throwIfAborted();
      light = snapshotThemeTokens();
      await setBodyThemeMode(plugin, "dark", staging, signal);
      await nextFrame();
      signal?.throwIfAborted();
      dark = snapshotThemeTokens();
      darkPaints = await snapshotSvgPaints(staging, checkpoint);
      await setBodyThemeMode(plugin, "light", staging, signal);
      await nextFrame();
      signal?.throwIfAborted();
      lightPaints = await snapshotSvgPaints(staging, checkpoint);
    }

    light.colors.diagramPaints = svgPaintTokens(lightPaints, darkPaints, light.values, dark.values);

    const sourceHeadings = [...staging.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    const headingIds = new Map(sourceHeadings.filter(heading => heading.id).map((heading, index) => [heading.id, `reader-section-${index + 1}`]));
    [...staging.querySelectorAll('[id^="fn-"] , [id^="fnref-"]')].forEach((node, i) => headingIds.set(node.id, `reader-footnote-${i + 1}`));
    const imageIndex = vaultImageIndex(plugin);
    const content = document.createElement("div");
    for (const child of staging.childNodes) {
      const cloned = await cloneHtmlNode(child, plugin, imageIndex, light.colors, headingIds, checkpoint);
      if (cloned) content.appendChild(cloned);
    }
    return buildHtmlReader(plugin, file, content, sourceHeadings, headingIds, light, dark, initialMode, checkpoint, preferenceId);
  });
}

async function exportHtml(plugin, file, targetPath) {
  if (!hasDesktopExports()) {
    return saveExportToVault(plugin, `${file.basename}.html`, await prepareHtmlDocument(plugin, file));
  }
  const remote = electronRemote();
  const choice = targetPath ? { filePath: targetPath } : await remote.dialog.showSaveDialog({
    defaultPath: `${file.basename}.html`,
    filters: [{ name: "HTML 阅读器", extensions: ["html", "htm"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"]
  });
  if (choice.canceled || !choice.filePath) return null;
  const fs = require("fs");
  fs.writeFileSync(choice.filePath, await prepareHtmlDocument(plugin, file), "utf8");
  if (!targetPath) remote.shell?.openPath(choice.filePath);
  return choice.filePath;
}

export { prepareHtmlDocument, exportHtml };
