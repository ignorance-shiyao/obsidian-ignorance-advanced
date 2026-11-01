/* VLOOK image magic, read from the image address (the note keeps it as written):
     #line / #block        grid behind a transparent image      #padding   room around it
     #invert #blur #aged #gray  filters (with `!`, the filter lifts on hover)
     #card / #cardd        postcard (hover / tiled), #border adds an edge
     ?fill=text|Rd         silhouette in the text colour or a colour code
     ?darksrc=invert       inverted in dark mode;  ?darksrc=~ | -/_ | name.png  another file in dark mode */
import { parseColorCode, type ColorCode } from "./color-code-core.js";

const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i;
const FILTERS: Record<string, string> = { invert: "invert", blur: "blur", aged: "sepia", gray: "gray" };

export interface ImageMagic {
  path: string;
  grid: "line" | "block" | null;
  padding: boolean;
  filter: string | null;
  filterHover: boolean;
  card: "hover" | "tile" | null;
  border: boolean;
  fill: "text" | ColorCode | null;
  dark: { invert: true } | { file: string } | null;
}

/** Splits `a.png?darksrc=~#card#border` into its path, query and hash words. Null when nothing VLOOK is in it. */
export function parseImageMagic(raw: string): ImageMagic | null {
  const hashAt = raw.indexOf("#");
  const beforeHash = hashAt < 0 ? raw : raw.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt);
  const words = hashAt < 0 ? [] : raw.slice(hashAt + 1).split("#").map(word => word.trim()).filter(Boolean);
  const query = new URLSearchParams(queryAt < 0 ? "" : beforeHash.slice(queryAt + 1));
  const magic: ImageMagic = { path, grid: null, padding: false, filter: null, filterHover: false, card: null, border: false, fill: null, dark: null };
  let found = false;
  for (const word of words) {
    const bare = word.replace(/!$/, "");
    if (word === "line" || word === "block") { magic.grid = word; found = true; }
    else if (word === "padding") { magic.padding = true; found = true; }
    else if (word === "border") { magic.border = true; found = true; }
    else if (word === "card" || word === "cardd") { magic.card = word === "card" ? "hover" : "tile"; found = true; }
    else if (FILTERS[bare]) { magic.filter = FILTERS[bare]; magic.filterHover = word.endsWith("!"); found = true; }
  }
  const fill = query.get("fill");
  if (fill) {
    const code = parseColorCode(`~${fill}~`);
    if (fill.toLowerCase() === "text") magic.fill = "text";
    else if (code && code.colors.length === 1) magic.fill = code.colors[0];
    if (magic.fill) found = true;
  }
  const dark = query.get("darksrc");
  if (dark === "invert") { magic.dark = { invert: true }; found = true; }
  else if (dark) { magic.dark = { file: darkFileName(path, dark) }; found = true; }
  return found ? magic : null;
}

/** `a/b.png` with `~` → `b~dark.png`; with a file name → that name. Always a sibling of the image. */
export function darkFileName(path: string, dark: string) {
  if (["~", "-", "_"].includes(dark)) {
    const file = path.slice(path.lastIndexOf("/") + 1);
    const dot = file.lastIndexOf(".");
    return dot < 0 ? `${file}${dark}dark` : `${file.slice(0, dot)}${dark}dark${file.slice(dot)}`;
  }
  return dark;
}

export const isImagePath = (path: string) => IMAGE.test(path);
