/* In-page capture for mobile, where there is no Electron window to screenshot.
   html2canvas repaints the element onto a canvas itself (no SVG
   foreignObject), so the canvas stays exportable on iOS WebKit as well. */
import { loadChunk } from "./chunks.js";
import { base64ToBytes } from "./bytes.js";

// iOS caps a canvas at about 16.7 million pixels; keep well inside it.
const MAX_CANVAS_PIXELS = 16_000_000;

const SVG_NS = "http://www.w3.org/2000/svg";
const PAINT_PROPERTIES = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "opacity", "color", "font-family", "font-size", "font-weight", "filter", "visibility", "display"];

/* html2canvas draws an SVG as a standalone image: HTML labels (Mermaid's
   foreignObject) are lost and pan/zoom transforms misplace it. So every
   diagram SVG is rasterized here first — labels turned into SVG text, theme
   var() colors resolved — and swapped for that PNG on the capture copy, at
   the exact place and size it has on screen. */
export async function rasterizeSvg(live) {
  const rect = live.getBoundingClientRect();
  if (rect.width < 24 || rect.height < 24) return null; // icons render fine as they are
  const copy = live.cloneNode(true);
  copy.setAttribute("xmlns", SVG_NS);
  // The theme colors diagrams from page stylesheets, which a standalone SVG
  // image never sees: bake the computed paint into the copy.
  const liveNodes = [...live.querySelectorAll("*")];
  [...copy.querySelectorAll("*")].forEach((node, index) => {
    const source = liveNodes[index];
    if (!source || source.closest("foreignObject")) return;
    const style = getComputedStyle(source);
    for (const name of PAINT_PROPERTIES) {
      const value = style.getPropertyValue(name);
      if (value) node.style.setProperty(name, value);
    }
  });
  const liveObjects = [...live.querySelectorAll("foreignObject")];
  [...copy.querySelectorAll("foreignObject")].forEach((object, index) => {
    const source = liveObjects[index];
    const inner = source?.querySelector("*") || source;
    const style = inner ? getComputedStyle(inner) : null;
    const x = parseFloat(object.getAttribute("x") || "0"), y = parseFloat(object.getAttribute("y") || "0");
    const w = parseFloat(object.getAttribute("width") || "0"), h = parseFloat(object.getAttribute("height") || "0");
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", String(x + w / 2));
    text.setAttribute("y", String(y + h / 2));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    if (style) {
      text.setAttribute("fill", style.color);
      text.setAttribute("font-size", style.fontSize);
      text.setAttribute("font-family", style.fontFamily);
      text.setAttribute("font-weight", style.fontWeight);
    }
    text.textContent = (source?.textContent || object.textContent || "").trim();
    object.replaceWith(text);
  });
  const styles = getComputedStyle(live);
  const resolve = value => value.replace(/var\((--[\w-]+)(?:,\s*([^()]*))?\)/g, (whole, name, fallback) => styles.getPropertyValue(name).trim() || fallback || whole);
  copy.querySelectorAll("style").forEach(tag => { tag.textContent = resolve(tag.textContent || ""); });
  [copy, ...copy.querySelectorAll("*")].forEach(node => {
    for (const attribute of [...node.attributes]) if (attribute.value.includes("var(")) node.setAttribute(attribute.name, resolve(attribute.value));
  });
  // Draw at the diagram's own size (its viewBox), independent of pan/zoom.
  const box = live.viewBox?.baseVal;
  const width = box?.width || rect.width, height = box?.height || rect.height;
  copy.removeAttribute("style");
  copy.setAttribute("width", String(width));
  copy.setAttribute("height", String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const scale = Math.min(3, Math.max(1, 2 * rect.width / width));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL("image/png"), rect };
  } catch (_) {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function capturePortable(element, { scale = 2, background = null, type = "image/png", quality = 0.92 } = {}) {
  const { html2canvas } = await loadChunk("chunk-capture.cjs");
  const liveSvgs = [...element.querySelectorAll("svg")].filter(svg => !svg.parentElement?.closest("svg"));
  const rasters = await Promise.all(liveSvgs.map(svg => rasterizeSvg(svg)));
  const rect = element.getBoundingClientRect();
  const area = Math.max(1, rect.width * rect.height);
  const fitted = Math.max(0.5, Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / area)));
  const canvas = await html2canvas(element, {
    scale: fitted,
    backgroundColor: background,
    useCORS: true,
    logging: false,
    // Measure against the element itself, not the window scroll position.
    scrollX: 0,
    scrollY: -window.scrollY,
    onclone: (_document, clonedElement) => {
      // html2canvas lays text out glyph by glyph; automatic CJK/Latin spacing
      // shifts glyphs under it (an opening 「 went missing), so turn it off.
      const reset = _document.createElement("style");
      reset.textContent = "*{text-autospace:no-autospace !important;text-spacing-trim:space-all !important;}";
      _document.head.appendChild(reset);
      const copies = [...clonedElement.querySelectorAll("svg")].filter(svg => !svg.parentElement?.closest("svg"));
      copies.forEach((svg, index) => {
        const raster = rasters[index];
        const parent = svg.parentElement;
        if (!raster || !parent) return;
        // Same place as on screen, relative to the (untransformed) parent box.
        const parentRect = liveSvgs[index].parentElement.getBoundingClientRect();
        const image = _document.createElement("img");
        image.src = raster.src;
        image.style.cssText = `position:absolute;left:${raster.rect.left - parentRect.left}px;top:${raster.rect.top - parentRect.top}px;width:${raster.rect.width}px;height:${raster.rect.height}px;max-width:none;`;
        if (getComputedStyle(liveSvgs[index].parentElement).position === "static") parent.style.position = "relative";
        // The SVG may have been what gave the parent its height.
        parent.style.minHeight = `${parentRect.height}px`;
        svg.replaceWith(image);
      });
    }
  });
  // toBlob encodes off the main thread; toDataURL froze the UI on every page.
  const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
  if (!blob) return base64ToBytes(canvas.toDataURL(type, quality).split(",")[1]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  canvas.width = canvas.height = 0; // release the bitmap now, not at GC (iOS caps canvas memory)
  return bytes;
}
