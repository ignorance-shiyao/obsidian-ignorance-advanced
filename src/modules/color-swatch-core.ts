/* Colour values get a small dot in that colour: inline code that is a colour
   (`#4D81EF`, `rgb(…)`, `hsl(…)`), and tags that are a hex colour (#C9561B —
   Obsidian turns a bare hex value into a tag, e.g. in tables). */

const COLOR_PATTERN = /^(?:#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([^()]*\))$/i;

// The colour an inline-code text stands for, or null. Only the whole code
// text counts, so `color: #fff` or a sentence mentioning #fff gets no dot.
export function colorValue(text: string): string | null {
  const value = String(text || "").trim();
  return COLOR_PATTERN.test(value) ? value : null;
}

// Inline code spans in a line of Markdown source: [contentFrom, contentTo, text].
export function inlineCodeSpans(line: string): Array<[number, number, string]> {
  const spans: Array<[number, number, string]> = [];
  const pattern = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
  for (let match; (match = pattern.exec(line));) {
    const from = match.index + match[1].length;
    spans.push([from, from + match[2].length, match[2]]);
  }
  return spans;
}

// Tags in a line of source that are hex colours: [hashFrom, color].
export function hexColorTags(line: string): Array<[number, string]> {
  const tags: Array<[number, string]> = [];
  const pattern = /(^|[^\w&/#])#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![\w/-])/gi;
  for (let match; (match = pattern.exec(line));) tags.push([match.index + match[1].length, `#${match[2]}`]);
  return tags;
}

// Plain-text hex colours (#182435 — all digits, so Obsidian makes no tag of
// it). Only 6 or 8 digits: a short #123 is more likely an issue number.
export function isPlainTextColor(color: string): boolean {
  return /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color);
}
