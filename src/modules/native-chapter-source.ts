import { createNativeChapterCards } from "./native-chapter-cards.js";
import { sourceChapterRanges, ChapterRange } from "./chapter-source.js";

export function chapterForSection(ranges: ChapterRange[], startLine: number, endLine: number): number {
  if (startLine < 0 || endLine < startLine) return -1;
  return ranges.findIndex(range => startLine >= range.startLine && endLine < range.endLine);
}

export function installNativeChapterSource(plugin) {
  const cards = createNativeChapterCards();
  const cache = new Map<string, { source: string; ranges: ChapterRange[]; ends: number[] }>();
  const elements = new Set<HTMLElement>();
  const clear = (element: HTMLElement) => {
    delete element.dataset.ibNativeChapter;
    delete element.dataset.ibNativeChapterTone;
    delete element.dataset.ibNativeChapterStart;
    delete element.dataset.ibNativeChapterEnd;
  };
  plugin.registerMarkdownPostProcessor((element: HTMLElement, context) => {
    clear(element);
    elements.delete(element);
    // Staging and nested renderers have their own source coordinates. Only
    // annotate native reading sections; never infer a range from an embed.
    if (element.closest(".ibp-staging,.ibp-book,.ibc-container,.internal-embed,.ibm-markdown-preview")) return;
    const info = context?.getSectionInfo?.(element);
    if (!info?.text || !context.sourcePath) return;
    let entry = cache.get(context.sourcePath);
    if (!entry || entry.source !== info.text) {
      const ranges = sourceChapterRanges(info.text), lines = info.text.split("\n");
      const ends = ranges.map(range => { let end = range.endLine - 1; while (end > range.startLine && !lines[end]?.trim()) end--; return end; });
      entry = { source: info.text, ranges, ends };
      cache.set(context.sourcePath, entry);
      if (cache.size > 32) cache.delete(cache.keys().next().value);
    }
    const index = chapterForSection(entry.ranges, info.lineStart, info.lineEnd);
    if (index < 0 || element.querySelector(".ibc-container--chapter")) return;
    element.dataset.ibNativeChapter = String(index);
    element.dataset.ibNativeChapterTone = String(entry.ranges[index].tone);
    if (info.lineStart === entry.ranges[index].startLine) element.dataset.ibNativeChapterStart = "";
    if (info.lineEnd >= entry.ends[index]) element.dataset.ibNativeChapterEnd = "";
    elements.add(element);
    cards.update(element);
    // Detached cached sections are safe to annotate again when re-used; do
    // not retain them indefinitely as long notes scroll through the viewport.
    for (const previous of elements) if (previous !== element && !previous.isConnected) elements.delete(previous);
  });
  plugin.register(() => {
    for (const element of elements) clear(element);
    document.querySelectorAll<HTMLElement>("[data-ib-native-chapter]").forEach(clear);
    cards.destroy();
    elements.clear(); cache.clear();
  });
}
