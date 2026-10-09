import { sourceChapterRanges } from "./chapter-source.js";

// Staging is owned by the plugin. Group its existing nodes without moving
// Obsidian's cached native sections. Pagination measures chapter children
// separately. Never re-render fragments: links, diagrams and tasks survive.
export function groupRenderedChapters(root: HTMLElement, source: string): number {
  if (root.querySelector(":scope > [data-ib-auto-chapter]")) return 0;
  const ranges = sourceChapterRanges(source);
  if (!ranges.length) return 0;
  const blocks = [...root.children] as HTMLElement[];
  const headingFor = (block: HTMLElement) => block.matches("h2") ? block
    : block.querySelector(":scope > h2");
  const headings = blocks.filter(block => headingFor(block) && !block.matches(".ibc-container"));
  // An embedded renderer may expose a different heading set. In that case do
  // not infer a chapter assignment from incomplete DOM/source correspondence.
  if (headings.length !== ranges.length) return 0;
  const starts = new Set(headings);
  let card: HTMLElement | null = null;
  let count = 0;
  for (const block of blocks) {
    if (starts.has(block)) {
      card = root.ownerDocument.createElement("div");
      card.className = "ibc-container ibc-container--chapter";
      card.dataset.ibcKind = "chapter";
      card.dataset.ibcTone = String(count % 3);
      card.dataset.ibAutoChapter = "";
      const rail = root.ownerDocument.createElement("span");
      rail.className = "ibc-chapter__rail";
      rail.setAttribute("aria-hidden", "true");
      card.appendChild(rail);
      root.insertBefore(card, block);
      count++;
    } else if (block.matches('.ibc-container--chapter') || block.querySelector('.ibc-container--chapter')) {
      // An explicit chapter keeps its own boundary and is never double-wrapped.
      card = null;
    }
    card?.appendChild(block);
  }
  return count;
}
