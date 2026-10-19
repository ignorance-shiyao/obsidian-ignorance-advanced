import { zh } from "../i18n.js";
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

export type WordFontChoice = "yahei" | "theme" | "simsun";
export const WORD_FONT_OPTIONS: readonly [WordFontChoice, string][] = [
  ["yahei", "微软雅黑"], ["theme", zh("跟随主题")], ["simsun", "宋体"]
];
export function normalizeWordFont(value: unknown): WordFontChoice {
  return value === "theme" || value === "simsun" ? value : "yahei";
}
export function wordExportFonts(value: unknown, fonts: { text: string; heading: string }) {
  const choice = normalizeWordFont(value);
  const body = choice === "simsun" ? "SimSun" : choice === "theme" ? wordFontFromToken(fonts.text, WORD_TEXT_FONT) : WORD_TEXT_FONT;
  return { fontFamily: body, headingFamily: body };
}
