import type { IgnorancePlugin } from "../plugin-types.js";
/* Heading numbers in Reading view: "1", "1.1", "1.1.1". A lone H1 is treated as the note's title and left
   out, so numbering starts at the first H2. Turned on globally in settings, or per note with the `ib-numbered`
   cssclass (`ib-unnumbered` turns it off for a note). */
export interface HeadingEntry { level: number; line: number; struck?: boolean }

const DIGITS = "零一二三四五六七八九";
/** 1 → 一, 10 → 十, 23 → 二十三 (up to 99; larger numbers fall back to digits). */
export function chineseNumeral(value: number): string {
  if (value < 1 || value > 99) return String(value);
  if (value < 10) return DIGITS[value];
  const tens = Math.floor(value / 10), ones = value % 10;
  return `${tens > 1 ? DIGITS[tens] : ""}十${ones ? DIGITS[ones] : ""}`;
}

export type NumberStyle = "decimal" | "chinese";

/** Turn the counters of one heading ([2, 1] = second chapter, first section) into its label. */
export function formatNumber(counters: number[], style: NumberStyle = "decimal"): string {
  if (style !== "chinese") return counters.join(".");
  const depth = counters.length - 1, value = counters[depth];
  return [`${chineseNumeral(value)}、`, `（${chineseNumeral(value)}）`, `${value}.`, `（${value}）`][Math.min(depth, 3)];
}

/** Map of heading line → number text. */
/** Indexes of headings that are struck through (`## ~~draft~~`) and of everything below them: unpublished. */
export function unpublishedIndexes(headings: HeadingEntry[]): Set<number> {
  const hidden = new Set<number>();
  let level = 0;
  headings.forEach((heading, index) => {
    if (level && heading.level <= level) level = 0;
    if (!level && heading.struck) level = heading.level;
    if (level) hidden.add(index);
  });
  return hidden;
}

/** Where numbering begins: "auto" leaves out a lone H1 (the note's title), "h1" numbers every heading, "h2" leaves H1s out. */
export type NumberStart = "auto" | "h1" | "h2";

export interface NumberOptions { depth: number; style: NumberStyle; start: NumberStart }

export function numberingOptions(plugin: IgnorancePlugin): NumberOptions {
  const state = plugin?.state || {};
  const depth = Math.round(Number(state.headingNumberDepth));
  return {
    depth: depth >= 1 && depth <= 6 ? depth : 4,
    style: state.headingNumberStyle === "chinese" ? "chinese" : "decimal",
    start: state.headingNumberStart === "h1" || state.headingNumberStart === "h2" ? state.headingNumberStart : "auto"
  };
}

export function numberHeadings(headings: HeadingEntry[], depth = 4, style: NumberStyle = "decimal", start: NumberStart = "auto"): Map<number, string> {
  const result = new Map<number, string>();
  let numbered = headings;
  if (start === "h2") numbered = headings.filter(heading => heading.level >= 2);
  else if (start === "auto" && headings.filter(heading => heading.level === 1).length === 1 && headings[0]?.level === 1) numbered = headings.slice(1);
  if (!numbered.length) return result;
  const base = Math.min(...numbered.map(heading => heading.level));
  const counters: number[] = [];
  for (const heading of numbered) {
    const index = heading.level - base;
    // Headings below the chosen depth stay unnumbered and do not disturb the counters above them.
    if (index >= depth) continue;
    while (counters.length <= index) counters.push(0);
    counters.length = index + 1; // a new heading starts its own sub-numbering over
    counters[index] += 1;
    for (let up = 0; up < index; up += 1) if (!counters[up]) counters[up] = 1; // a skipped level counts as 1
    result.set(heading.line, formatNumber(counters, style));
  }
  return result;
}

/** Number a document's headings the way the settings ask. */
export function numberWithOptions(headings: HeadingEntry[], options: NumberOptions) {
  return numberHeadings(headings, options.depth, options.style, options.start);
}

export function wantsNumbers(plugin: IgnorancePlugin, frontmatter) {
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-unnumbered")) return false;
  return plugin.state?.headingNumbers === true || classes.includes("ib-numbered");
}

/** Heading lines of a document (skipping front matter and fenced code): [{ level, line, offset }] with the offset of the text after "## ". Setext headings (underlined with === or ---) count too. */
export function scanHeadings(lines: string[]) {
  const found: Array<HeadingEntry & { offset: number }> = [];
  let fence = "";
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) start = end + 1;
  }
  let math = false;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    // A fence closes only on a bare line of the same character and at least the same length, so a
    // four-backtick block can carry three-backtick fences (and their headings) inside it.
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
      continue;
    }
    if (marker) { fence = marker[1]; continue; }
    if (/^\s*\$\$/.test(line) && !/^\s*\$\$.+\$\$\s*$/.test(line)) { math = !math; continue; }
    if (math) continue;
    const heading = /^ {0,3}(#{1,6})[ \t]+\S/.exec(line);
    if (heading) {
      found.push({ level: heading[1].length, line: index, offset: heading[0].length - 1, struck: /^ {0,3}#{1,6}[ \t]+~~.+~~[ \t]*#*[ \t]*$/.test(line) });
      continue;
    }
    // A single text line right under a blank line and over === or --- is a heading too.
    const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[index + 1] ?? "");
    const plain = /^\S/.test(line) && !/^(?:[>|#*+-]|\d+[.)]|<|!\[\[|\[\^|:::)/.test(line);
    if (underline && plain && (index === start || !lines[index - 1].trim())) {
      found.push({ level: underline[1][0] === "=" ? 1 : 2, line: index, offset: 0, struck: /^~~.+~~\s*$/.test(line) });
      index += 1;
    }
  }
  return found;
}

/* Reading view keeps the sections that did not change when a note is edited, so a number written into one of
   them goes stale as soon as a heading is added or removed above it. Every heading remembers where it came from
   and is renumbered from the current text after each render pass. */
const origins = new WeakMap<Element, { element: Element; context: any }>();

function headingOf(element: Element) {
  return element.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6") || (/^H[1-6]$/.test(element.tagName) ? element : null);
}

function renumber(plugin: IgnorancePlugin) {
  const options = numberingOptions(plugin);
  const cache = new Map<string, Map<number, string>>();
  for (const badge of document.querySelectorAll<HTMLElement>(".markdown-preview-view .ib-heading-number:not(.ib-heading-number--editor)")) {
    const heading = badge.parentElement;
    const origin = heading && origins.get(heading);
    const info = origin?.context.getSectionInfo?.(origin.element);
    if (!heading || !info) continue;
    let numbers = cache.get(info.text);
    if (!numbers) {
      const all = scanHeadings(info.text.split(/\r?\n/));
      const hidden = unpublishedIndexes(all);
      numbers = numberWithOptions(all.filter((_, index) => !hidden.has(index)), options);
      cache.set(info.text, numbers);
    }
    const text = numbers.get(info.lineStart);
    if (text === undefined) badge.remove();
    else if (badge.textContent !== text) badge.textContent = text;
  }
}

export function installHeadingNumbers(plugin: IgnorancePlugin) {
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => renumber(plugin), 150);
  };
  plugin.register(() => window.clearTimeout(timer));
  plugin.registerMarkdownPostProcessor((element, context) => {
    const info = context.getSectionInfo?.(element);
    if (!info) return;
    const heading = headingOf(element);
    if (!heading) return;
    const all = scanHeadings(info.text.split(/\r?\n/));
    const hidden = unpublishedIndexes(all);
    const position = all.findIndex(entry => entry.line === info.lineStart);
    // Struck-through headings (and what is below them) are drafts: marked here, left out of exports.
    if (position >= 0 && hidden.has(position)) heading.classList.add("ib-unpublished");
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    const cache = file && plugin.app.metadataCache.getFileCache(file);
    if (!cache || !wantsNumbers(plugin, cache.frontmatter)) return;
    origins.set(heading, { element, context });
    schedule();
    if (heading.querySelector(".ib-heading-number")) return;
    const entries = all.filter((_, index) => !hidden.has(index));
    const text = numberWithOptions(entries, numberingOptions(plugin)).get(info.lineStart);
    if (!text) return;
    const badge = createSpan({ cls: "ib-heading-number", text });
    badge.setAttribute("aria-hidden", "true");
    heading.prepend(badge);
  });
}
