/* Compatibility with a common Typora-style inline dialect, decided from the shape of an <em>'s children.
   Pure: the caller describes the children, this returns what to build. */
export interface Part { kind: "text" | "code" | "strong" | "mark" | "sup" | "other"; text: string }
export type CompatAction =
  | { type: "pill"; value: string }
  | { type: "badge"; value: string; note: string }
  | { type: "spoiler"; tip: string; value: string }
  | { type: "crumb"; parts: string[] }
  | { type: "ruby"; note: string }
  | null;

export function classifyEmphasis(input: Part[]): CompatAction {
  const parts = input.filter(part => part.kind !== "text" || part.text.trim());
  if (parts.some(part => part.kind === "other")) return null;
  const only = parts.length === 1 ? parts[0] : null;
  // *`tag`*
  if (only?.kind === "code" && only.text.trim()) return { type: "pill", value: only.text.trim() };
  // *==A > B > C==*
  if (only?.kind === "mark") {
    const crumbs = only.text.split(/\s*>\s*/).map(text => text.trim()).filter(Boolean);
    return crumbs.length >= 2 ? { type: "crumb", parts: crumbs } : null;
  }
  // _^pinyin^_ (the caller attaches it to the character before)
  if (only?.kind === "sup" && only.text.trim()) return { type: "ruby", note: only.text.trim() };
  // *name`value`* and *name`value`suffix*
  const codes = parts.filter(part => part.kind === "code");
  if (codes.length === 1 && parts.length >= 2 && parts.every(part => part.kind === "text" || part.kind === "code")) {
    const at = parts.indexOf(codes[0]);
    const before = parts.slice(0, at).map(part => part.text).join("").trim();
    const after = parts.slice(at + 1).map(part => part.text).join("").trim();
    if (before) return { type: "badge", value: before, note: after ? `${codes[0].text.trim()} ${after}` : codes[0].text.trim() };
  }
  // *tip**hidden***
  const last = parts[parts.length - 1];
  if (parts.length >= 2 && last.kind === "strong" && last.text.trim() && parts.slice(0, -1).every(part => part.kind === "text")) {
    return { type: "spoiler", tip: parts.slice(0, -1).map(part => part.text).join("").trim(), value: last.text.trim() };
  }
  return null;
}

/** The base a ruby annotation sits on: the last Latin word, or else the last character. */
export function rubyBase(text: string): string {
  const word = /([A-Za-z]+)$/.exec(text);
  return word ? word[1] : Array.from(text).slice(-1)[0] ?? "";
}

/** Obsidian renders `*tip**hidden***` as a literal star, then a bold run whose text ends with the closing star.
 *  Given the text before, inside and after the bold run, returns the parts; null when it is not that shape. */
export function splitLiteralScratch(before: string, inside: string, after: string): { prefix: string; tip: string; value: string; suffix: string } | null {
  const tip = /\*([^*\s][^*]*)$/.exec(before);
  if (!tip) return null;
  let value = inside, suffix = after;
  if (value.endsWith("*") && !value.endsWith("**")) value = value.slice(0, -1);
  else if (suffix.startsWith("*") && !suffix.startsWith("**")) suffix = suffix.slice(1);
  else return null;
  if (!value.trim()) return null;
  return { prefix: before.slice(0, tip.index), tip: tip[1].trim(), value: value.trim(), suffix };
}
