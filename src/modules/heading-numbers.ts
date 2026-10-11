/* Heading numbers in Reading view: "1", "1.1", "1.1.1". A lone H1 is treated as the note's title and left
   out, so numbering starts at the first H2. Turned on globally in settings, or per note with the `ib-numbered`
   cssclass (`ib-unnumbered` turns it off for a note). */
export interface HeadingEntry { level: number; line: number }

/** Map of heading line → number text. */
export function numberHeadings(headings: HeadingEntry[], depth = 4): Map<number, string> {
  const result = new Map<number, string>();
  const titleOnly = headings.filter(heading => heading.level === 1).length === 1 && headings[0]?.level === 1;
  const numbered = titleOnly ? headings.slice(1) : headings;
  if (!numbered.length) return result;
  const base = Math.min(...numbered.map(heading => heading.level));
  const counters: number[] = [];
  for (const heading of numbered) {
    const depthIndex = Math.min(heading.level - base, depth - 1);
    counters.length = depthIndex + 1;
    for (let index = 0; index <= depthIndex; index += 1) counters[index] = (counters[index] || (index === depthIndex ? 0 : 1)) + (index === depthIndex ? 1 : 0);
    result.set(heading.line, counters.join("."));
  }
  return result;
}

function wantsNumbers(plugin, frontmatter) {
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-unnumbered")) return false;
  return plugin.state?.headingNumbers === true || classes.includes("ib-numbered");
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
    const text = numberHeadings(entries).get(info.lineStart);
    if (!text) return;
    const badge = createSpan({ cls: "ib-heading-number", text });
    badge.setAttribute("aria-hidden", "true");
    heading.prepend(badge);
  });
}
