export const WORD_TEXT_FONT = "Microsoft YaHei";

const CSS_FONT_ALIASES = new Set([
  "-apple-system", "blinkmacsystemfont", "sfmono-regular", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "emoji", "math", "fangsong",
  "inherit", "initial", "unset", "revert", "revert-layer"
]);

/** Office needs family names; SFMono-Regular is a browser/system alias, not a portable family. */
export function wordFontFromToken(value: string, fallback: string) {
  const families = String(value || "").split(",").map(name => name.trim().replace(/^['"]|['"]$/g, ""));
  return families.find(name => name && !CSS_FONT_ALIASES.has(name.toLowerCase())) || fallback;
}
