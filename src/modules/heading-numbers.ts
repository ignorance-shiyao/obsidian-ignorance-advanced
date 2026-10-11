/* Heading numbers in Reading view: "1", "1.1", "1.1.1". A lone H1 is treated as the note's title and left
   out, so numbering starts at the first H2. Turned on globally in settings, or per note with the `ib-numbered`
   cssclass (`ib-unnumbered` turns it off for a note). */
export interface HeadingEntry { level: number; line: number }

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
export function numberHeadings(headings: HeadingEntry[], depth = 4, style: NumberStyle = "decimal"): Map<number, string> {
  const result = new Map<number, string>();
  const titleOnly = headings.filter(heading => heading.level === 1).length === 1 && headings[0]?.level === 1;
  const numbered = titleOnly ? headings.slice(1) : headings;
  if (!numbered.length) return result;
  const base = Math.min(...numbered.map(heading => heading.level));
  const counters: number[] = [];
  for (const heading of numbered) {
    const index = Math.min(heading.level - base, depth - 1);
    while (counters.length <= index) counters.push(0);
    counters.length = index + 1; // a new heading starts its own sub-numbering over
    counters[index] += 1;
    for (let up = 0; up < index; up += 1) if (!counters[up]) counters[up] = 1; // a skipped level counts as 1
    result.set(heading.line, formatNumber(counters, style));
  }
  return result;
}

export function wantsNumbers(plugin, frontmatter) {
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-unnumbered")) return false;
  return plugin.state?.headingNumbers === true || classes.includes("ib-numbered");
}

/** Heading lines of a document (skipping front matter and fenced code): [{ level, line, offset }] with the offset of the text after "## ". */
export function scanHeadings(lines: string[]) {
  const found: Array<HeadingEntry & { offset: number }> = [];
  let fence = "";
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) start = end + 1;
  }
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const marker = /^\s*(`{3,}|~{3,})/.exec(line);
    if (marker) { fence = fence ? (marker[1][0] === fence ? "" : fence) : marker[1][0]; continue; }
    if (fence) continue;
    const heading = /^(#{1,6})\s+\S/.exec(line);
    if (heading) found.push({ level: heading[1].length, line: index, offset: heading[0].length - 1 });
  }
  return found;
}

export function installHeadingNumbers(plugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    const info = context.getSectionInfo?.(element);
    if (!info) return;
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    const cache = file && plugin.app.metadataCache.getFileCache(file);
    if (!cache?.headings?.length || !wantsNumbers(plugin, cache.frontmatter)) return;
    const heading = element.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6") || (/^H[1-6]$/.test(element.tagName) ? element : null);
    if (!heading || heading.querySelector(".ib-heading-number")) return;
    const entries = cache.headings.map(item => ({ level: item.level, line: item.position.start.line }));
    const text = numberHeadings(entries, 4, plugin.state?.headingNumberStyle === "chinese" ? "chinese" : "decimal").get(info.lineStart);
    if (!text) return;
    const badge = createSpan({ cls: "ib-heading-number", text });
    badge.setAttribute("aria-hidden", "true");
    heading.prepend(badge);
  });
}
