const CSS_FONT_ALIASES = new Set([
  "-apple-system", "blinkmacsystemfont", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded",
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "emoji", "math", "fangsong",
  "inherit", "initial", "unset", "revert", "revert-layer"
]);

/** Word needs a font family name rather than a CSS generic or system alias. */
export function wordFontFromToken(value: string, fallback: string) {
  const families = String(value || "").split(",").map(name => name.trim().replace(/^['"]|['"]$/g, ""));
  return families.find(name => name && !CSS_FONT_ALIASES.has(name.toLowerCase())) || fallback;
}
