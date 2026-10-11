/* Heading numbers and captions for renders that have no per-section source info (paged reading, PDF, HTML
   and image export): the whole note is rendered into one container, and the source decides which element
   gets which number. A kind is skipped when the document and the source disagree about how many there are. */
import { captionParagraph, captionPattern, parseCaptions, resolveRefs, wantsCaptions, wrapFigure, type CaptionKind } from "./captions.js";
import { numberHeadings, scanHeadings, unpublishedIndexes, wantsNumbers } from "./heading-numbers.js";

const headingSelector = "h1, h2, h3, h4, h5, h6";

const levelOf = (element: Element) => {
  const heading = element.matches(headingSelector) ? element : element.querySelector(headingSelector);
  return heading ? Number(heading.tagName[1]) : 0;
};

/** `## ~~draft~~`: a heading that is entirely struck through, and everything under it, stays out of paged reading
 *  and exports. Works on the rendered document alone. */
export function removeUnpublished(root: HTMLElement) {
  const isStruck = (heading: Element) => {
    const parts = [...heading.childNodes].filter(node => (node.textContent || "").trim());
    return parts.length === 1 && /^(DEL|S)$/.test((parts[0] as Element).tagName || "");
  };
  for (const heading of [...root.querySelectorAll(headingSelector)]) {
    if (!heading.isConnected || !isStruck(heading)) continue;
    const level = Number(heading.tagName[1]);
    let top: Element = heading;
    while (top.parentElement && top.parentElement !== root) top = top.parentElement;
    let node: Element | null = top;
    while (node) {
      const next: Element | null = node.nextElementSibling;
      node.remove();
      if (!next || (levelOf(next) > 0 && levelOf(next) <= level)) break;
      node = next;
    }
  }
}

function applyHeadingNumbers(plugin, root: HTMLElement, source: string) {
  const all = scanHeadings(source.split(/\r?\n/));
  const hidden = unpublishedIndexes(all);
  const entries = all.filter((_, index) => !hidden.has(index));
  const headings = [...root.querySelectorAll<HTMLElement>(headingSelector)].filter(heading => !heading.closest(".ibp-page-header"));
  if (!entries.length || entries.length !== headings.length) return;
  const style = plugin.state?.headingNumberStyle === "chinese" ? "chinese" : "decimal";
  const numbers = numberHeadings(entries, 4, style);
  entries.forEach((entry, index) => {
    const text = numbers.get(entry.line);
    const heading = headings[index];
    if (!text || heading.querySelector(".ib-heading-number")) return;
    heading.prepend(createSpan({ cls: "ib-heading-number", text }));
  });
}

const followsBlock = (paragraph: Element, kind: CaptionKind) => {
  const before = paragraph.previousElementSibling;
  if (!before) return false;
  if (kind === "tab") return before.matches("table, .el-table") || Boolean(before.querySelector(":scope > table"));
  if (kind === "code") return before.matches("pre, .el-pre") || Boolean(before.querySelector(":scope > pre"));
  return before.matches(".math, .math-block") || Boolean(before.querySelector(".math-block"));
};

function applyCaptions(root: HTMLElement, source: string) {
  const entries = parseCaptions(source);
  if (!entries.length && !root.querySelector(".ib-inline-ref")) return;

  const figures = entries.filter(entry => entry.kind === "fig");
  // A figure is an image alone in its paragraph (a row of several images is not one).
  const holders = [...root.querySelectorAll("p")]
    .filter(paragraph => !paragraph.closest(".ibc-container--gallery, .ibc-container--compare") && !(paragraph.textContent || "").trim())
    .map(paragraph => {
      const found = [...paragraph.querySelectorAll(".internal-embed, img")].filter(item => !item.parentElement?.closest(".internal-embed"));
      return found.length === 1 ? found[0] : null;
    })
    .filter((holder): holder is Element => Boolean(holder) && !holder.closest("figure.ib-figure"));
  if (figures.length === holders.length) figures.forEach((entry, index) => wrapFigure(holders[index], entry));

  for (const kind of ["tab", "code", "eq"] as CaptionKind[]) {
    const wantedEntries = entries.filter(entry => entry.kind === kind);
    const pattern = captionPattern(kind);
    const paragraphs = [...root.querySelectorAll("p")].filter(paragraph => pattern?.test(paragraph.textContent || "") && followsBlock(paragraph, kind));
    if (wantedEntries.length === paragraphs.length) wantedEntries.forEach((entry, index) => captionParagraph(paragraphs[index] as HTMLElement, entry));
  }
  resolveRefs(root, entries);
}

export function enhanceStaged(plugin, root: HTMLElement, source: string, file) {
  removeUnpublished(root);
  const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  if (wantsNumbers(plugin, frontmatter)) applyHeadingNumbers(plugin, root, source);
  if (wantsCaptions(plugin, frontmatter)) applyCaptions(root, source);
}
