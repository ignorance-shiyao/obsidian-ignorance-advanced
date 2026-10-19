/* Batch image processing for one note: find the local images it uses, work out smaller sizes, and rewrite the
   links to point at the copies. Pure; the canvas work and file writes are in image-batch.ts. */
export interface ImageRef {
  /** Offsets of the link target inside the source (the part that is replaced). */
  from: number;
  to: number;
  /** The target as written, decoded: "a.png" or "folder/a.png". */
  target: string;
  kind: "wiki" | "markdown";
}

const IMAGE_EXT = /\.(?:png|jpe?g|webp|bmp)$/i;
const SKIP = /^(?:https?:|data:|mailto:)/i;

function protectedSpans(source: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const match of source.matchAll(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2[^\n]*(?=\n|$)|$)|`[^`\n]+`/g)) spans.push([match.index, match.index + match[0].length]);
  return spans;
}

/** Local PNG / JPEG / WebP / BMP images embedded in the note, outside code. GIF and SVG are left out on purpose. */
export function findImageRefs(source: string): ImageRef[] {
  const spans = protectedSpans(source);
  const inside = (index: number) => spans.some(([a, b]) => index >= a && index < b);
  const refs: ImageRef[] = [];
  for (const match of source.matchAll(/!\[\[([^\]|#\n]+)((?:[|#][^\]\n]*)?)\]\]/g)) {
    if (inside(match.index) || !IMAGE_EXT.test(match[1].trim())) continue;
    const from = match.index + 3;
    refs.push({ from, to: from + match[1].length, target: match[1].trim(), kind: "wiki" });
  }
  for (const match of source.matchAll(/!\[[^\]\n]*\]\((<[^>\n]+>|[^)\s\n]+)((?:\s+(?:"[^"\n]*"|'[^'\n]*'))?)\)/g)) {
    if (inside(match.index)) continue;
    const raw = match[1];
    const wrapped = raw.startsWith("<");
    const written = wrapped ? raw.slice(1, -1) : raw;
    if (SKIP.test(written) || !IMAGE_EXT.test(written.split(/[?#]/)[0])) continue;
    let target = written;
    try { target = decodeURIComponent(written); } catch { /* keep as written */ }
    const from = match.index + match[0].indexOf(raw);
    refs.push({ from, to: from + raw.length, target, kind: "markdown" });
  }
  return refs.sort((a, b) => a.from - b.from);
}

/** Fits (width, height) inside a square of `maxEdge` without enlarging; returns null when no change is needed. */
export function targetSize(width: number, height: number, maxEdge: number): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (!(maxEdge > 0) || longest <= maxEdge) return null;
  const scale = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type OutputFormat = "keep" | "webp";
/** What to write for a source type: transparency and animation must survive, so those never become JPEG. */
export function outputType(sourceMime: string, hasAlpha: boolean, format: OutputFormat): "image/jpeg" | "image/png" | "image/webp" {
  if (format === "webp") return "image/webp";
  if (sourceMime === "image/jpeg") return "image/jpeg";
  if (sourceMime === "image/webp") return "image/webp";
  return hasAlpha ? "image/png" : "image/jpeg";
}

export const extensionFor = (mime: string) => mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";

/** A name for the copy that does not exist yet: `a.png` → `a-min.jpg`, then `a-min 2.jpg`. */
export function copyName(original: string, extension: string, exists: (name: string) => boolean): string {
  const stem = original.replace(/\.[^./\\]+$/, "");
  let name = `${stem}-min.${extension}`;
  for (let index = 2; exists(name); index += 1) name = `${stem}-min ${index}.${extension}`;
  return name;
}

/** Rewrites each image target found by `findImageRefs`; `replacements` maps the old target to the new link text. Applied last to first. */
export function rewriteRefs(source: string, refs: ImageRef[], replacements: Map<string, string>): string {
  let result = source;
  for (const ref of [...refs].sort((a, b) => b.from - a.from)) {
    const next = replacements.get(ref.target);
    if (!next) continue;
    const text = ref.kind === "markdown" ? (/[\s()]/.test(next) ? `<${next}>` : encodeURI(next).replace(/[()]/g, c => c === "(" ? "%28" : "%29")) : next;
    const wrapped = ref.kind === "markdown" && source[ref.from] === "<";
    result = result.slice(0, ref.from) + (wrapped && !text.startsWith("<") ? `<${next}>` : text) + result.slice(ref.to);
  }
  return result;
}

export const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`;
