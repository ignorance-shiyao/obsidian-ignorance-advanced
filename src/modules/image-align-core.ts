/* Image alignment lives in the link itself, next to Obsidian's width:
     ![说明|left|616](assets/a.webp)   ![[a.webp|right|616]]
   Centered is the default and is written as no keyword at all. */

export const IMAGE_ALIGNMENTS = ["left", "center", "right"] as const;
const KEYWORDS = new Set(["left", "center", "right"]);

// The image link that starts at `from` in `text`, or null.
export function imageLinkAt(text, from) {
  const rest = text.slice(from);
  const wiki = /^!\[\[([^\]\n]+)\]\]/.exec(rest);
  if (wiki) return { from, to: from + wiki[0].length, kind: "wiki", inner: wiki[1] };
  const markdown = /^!\[([^\]\n]*)\]\(([^)\n]*)\)/.exec(rest);
  if (markdown) return { from, to: from + markdown[0].length, kind: "markdown", inner: markdown[1], url: markdown[2] };
  return null;
}

export function imageAlignment(link) {
  const segments = link.kind === "wiki" ? link.inner.split("|").slice(1) : link.inner.split("|");
  return segments.find(segment => KEYWORDS.has(segment.trim()))?.trim() || "center";
}

export function withImageAlignment(link, align) {
  const parts = link.inner.split("|");
  const head = link.kind === "wiki" ? [parts.shift()] : [];
  const kept = parts.filter(segment => segment.trim() && !KEYWORDS.has(segment.trim()));
  if (align !== "center") {
    // Keep the width last, as Obsidian expects: caption|align|width.
    const widthAt = kept.findIndex(segment => /^\d+(x\d+)?$/.test(segment.trim()));
    kept.splice(widthAt === -1 ? kept.length : widthAt, 0, align);
  }
  const inner = [...head, ...kept].join("|");
  return link.kind === "wiki" ? `![[${inner}]]` : `![${inner}](${link.url})`;
}

// The link without its width (Obsidian's "reset size").
export function withoutImageWidth(link) {
  const parts = link.inner.split("|");
  const head = link.kind === "wiki" ? [parts.shift()] : [];
  const kept = parts.filter(segment => !/^\s*\d+(x\d+)?\s*$/.test(segment));
  const inner = [...head, ...kept].join("|");
  return link.kind === "wiki" ? `![[${inner}]]` : `![${inner}](${link.url})`;
}

export function withImageSize(link, width: number, height: number) {
  const clean = withoutImageWidth(link);
  const parsed = imageLinkAt(clean, 0);
  const inner = `${parsed.inner}|${Math.round(width)}x${Math.round(height)}`;
  return parsed.kind === "wiki" ? `![[${inner}]]` : `![${inner}](${parsed.url})`;
}

export function resizedImageBox(width: number, height: number, dx: number, dy: number, direction: string) {
  const x = direction.includes("w") ? -1 : direction.includes("e") ? 1 : 0;
  const y = direction.includes("n") ? -1 : direction.includes("s") ? 1 : 0;
  if (x && y) {
    const ratio = Math.max(32 / width, 32 / height, 1 + (x * dx * width + y * dy * height) / (width * width + height * height));
    return { width: width * ratio, height: height * ratio };
  }
  return { width: Math.max(32, width + x * dx), height: Math.max(32, height + y * dy) };
}

// The link pointing at another file, keeping its caption and alignment. Sizes written as WxH are
// dropped (a crop changes the proportions); a plain width stays.
export function withImageTarget(link, target: string) {
  const parts = link.inner.split("|");
  const head = link.kind === "wiki" ? [target] : [];
  if (link.kind === "wiki") parts.shift();
  const kept = parts.filter(segment => !/^\s*\d+x\d+\s*$/.test(segment));
  const inner = [...head, ...kept].join("|");
  return link.kind === "wiki" ? `![[${inner}]]` : `![${inner}](${encodeURI(target)})`;
}
