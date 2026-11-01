/* Colour codes: `_~Rd~_` colours text, `_~Rd!~_` colours a table cell's background, and a run of codes
   (`_~RdGnBu~_`) makes a gradient. Obsidian renders `_~Rd~_` as <em>~Rd~</em>; this file only parses. */
export const COLOR_CODES = ["rd", "ro", "og", "ye", "la", "lm", "gn", "gy", "gd", "aq", "au", "cf", "cy", "wt", "bu", "bn", "bk",
  "se", "sk", "vn", "pl", "pu", "pk", "mn", "wn", "ol", "t1", "t2", "tu"] as const;
export type ColorCode = typeof COLOR_CODES[number];

const CODE = `(?:${COLOR_CODES.join("|")})`;
const SYNTAX = new RegExp(`^~((?:${CODE})+)(!)?~$`, "i");
// Bright hues read poorly as text on a light page; they are darkened when used for text.
const TOO_LIGHT = new Set<string>(["ye", "lm", "aq", "sk", "la", "pl", "pk", "gd", "cy"]);

export interface ColorSpec { colors: ColorCode[]; emphasis: boolean }

/** `~Rd~` → { colors: ["rd"], emphasis: false }; `~RdGn!~` → { colors: ["rd", "gn"], emphasis: true }. */
export function parseColorCode(text: string): ColorSpec | null {
  const match = SYNTAX.exec(text.trim());
  if (!match) return null;
  const colors = match[1].toLowerCase().match(/../g) as ColorCode[];
  return { colors, emphasis: Boolean(match[2]) };
}

/** The CSS colour of a code: plain, faded (backgrounds and highlights) or text-safe. */
export function colorVar(code: ColorCode, tone: "solid" | "fade" | "text" = "solid") {
  if (tone === "fade") return `var(--ib-ac-${code}-fade)`;
  if (tone === "text" && TOO_LIGHT.has(code)) return `var(--ib-ac-${code}-text)`;
  return `var(--ib-ac-${code})`;
}

export function gradient(colors: ColorCode[], angle: number, tone: "solid" | "fade" = "solid") {
  return `linear-gradient(${angle}deg, ${colors.map(code => colorVar(code, tone)).join(", ")})`;
}

/** `["rd", "gn"]` → `RdGn`, the form shown in tooltips and data attributes. */
export function colorLabel(colors: ColorCode[]) {
  return colors.map(code => code[0].toUpperCase() + code[1]).join("");
}
