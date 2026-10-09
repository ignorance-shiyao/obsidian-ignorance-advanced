/* Converting computed CSS into PowerPoint text options (pure, unit-tested). */

// "rgb(12, 34, 56)" / "rgba(…, a)" → "0C2238" (+ transparency 0–100), or null when invisible.
export function cssColor(value: string): { hex: string; transparency: number } | null {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(value || "");
  if (!match) return null;
  let alpha = match[4] === undefined ? 1 : parseFloat(match[4]) / (match[4].endsWith("%") ? 100 : 1);
  if (alpha <= 0.02) return null;
  alpha = Math.min(1, alpha);
  const hex = match.slice(1, 4).map(v => Math.round(Math.min(255, parseFloat(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { hex, transparency: Math.round((1 - alpha) * 100) };
}

const GENERIC_FAMILIES: Record<string, string> = {
  "-apple-system": "PingFang SC",
  "blinkmacsystemfont": "PingFang SC",
  "system-ui": "PingFang SC",
  "ui-sans-serif": "PingFang SC",
  "sans-serif": "PingFang SC",
  "serif": "Songti SC",
  "ui-serif": "Songti SC",
  "monospace": "Menlo",
  "ui-monospace": "Menlo"
};

// First usable font of a CSS font-family list; generic names map to a macOS font.
// `usable(name)` lets the caller skip fonts that are missing or lack the text's glyphs.
export function fontFace(family: string, usable: (name: string) => boolean = () => true): string {
  for (const raw of String(family || "").split(",")) {
    const name = raw.trim().replace(/^["']|["']$/g, "");
    if (!name || name === "??") continue;
    const face = GENERIC_FAMILIES[name.toLowerCase()] || name;
    if (usable(face)) return face;
  }
  return "PingFang SC";
}

export function hasCjk(text: string): boolean {
  return /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(text || "");
}

// CSS px on the unscaled slide canvas → PowerPoint points.
export function fontPoints(cssPx: number, canvasWidthPx: number, slideWidthIn: number): number {
  return Math.max(6, Math.round(cssPx * slideWidthIn * 72 / canvasWidthPx * 2) / 2);
}

export function isBold(weight: string | number): boolean {
  return Number(weight) >= 600 || weight === "bold" || weight === "bolder";
}

export function textAlign(value: string): "left" | "center" | "right" | "justify" {
  if (value === "center" || value === "right" || value === "justify") return value;
  if (value === "end") return "right";
  return "left";
}

// Collapse HTML whitespace the way a browser renders normal text.
export function collapseWhitespace(text: string): string {
  return String(text).replace(/[\t\n\r ]+/g, " ");
}

export interface BlockBox { x: number; y: number; w: number; h: number }
export interface MergeCandidate { key: string; parent: unknown; rect: BlockBox; lineHeight: number }

/* Groups consecutive text blocks that should share one text box: same parent,
   same paragraph style, aligned left edges and similar widths, separated only
   by a normal paragraph gap. Returns groups of indices in document order. */
export function groupAdjacentBlocks(items: MergeCandidate[]): number[][] {
  const groups: number[][] = [];
  items.forEach((item, index) => {
    const group = groups[groups.length - 1];
    const prev = group ? items[group[group.length - 1]] : null;
    const gap = prev ? item.rect.y - (prev.rect.y + prev.rect.h) : Infinity;
    const joins = prev
      && prev.parent === item.parent
      && prev.key === item.key
      && Math.abs(prev.rect.x - item.rect.x) < 0.05
      && Math.abs(prev.rect.w - item.rect.w) < Math.max(0.1, prev.rect.w * 0.05)
      && gap > -0.02 && gap < Math.max(prev.lineHeight, item.lineHeight) * 1.6;
    if (joins) group.push(index);
    else groups.push([index]);
  });
  return groups;
}
