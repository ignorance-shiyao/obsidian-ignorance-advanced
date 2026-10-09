export interface PaginationBlock {
  top: number;
  bottom: number;
  atomic: boolean;
  breakpoints: number[];
  leadIn: boolean;
  continuationOverhead?: number;
}

const LINE_BREAK_SAFETY = 2;

interface PaginationElement {
  children: Iterable<PaginationElement>;
  matches(selector: string): boolean;
  querySelector(selector: string): { children: Iterable<PaginationElement> } | null;
}

export function paginationElements(strip: { children: Iterable<PaginationElement> }) {
  const elements: PaginationElement[] = [];
  const append = (element: PaginationElement) => {
    if (element.matches("[data-ib-auto-chapter]")) {
      [...element.children].filter(child => !child.matches(".ibc-chapter__rail")).forEach(append);
      return;
    }
    if (element.matches(".ibm-markdown-preview-block")) {
      const preview = element.querySelector(":scope > .ibm-markdown-preview");
      const children = preview ? [...preview.children] : [];
      if (children.length) children.forEach(append);
      else elements.push(element);
      return;
    }
    elements.push(element);
  };
  [...strip.children].forEach(append);
  return elements;
}

export function paginateStrip(blocks: PaginationBlock[], contentHeight: number, mode: string) {
  const end = blocks.reduce((max, block) => Math.max(max, block.bottom), 0);
  const windows: { start: number; stop: number }[] = [];
  let start = 0;
  for (let guard = 0; start < end - 1 && guard < 2000; guard += 1) {
    const continuing = blocks.find(block => block.top < start - 0.5 && block.bottom > start + 0.5 && (block.continuationOverhead || 0) > 0);
    const overhead = Math.min(contentHeight - 1, Math.max(0, continuing?.continuationOverhead || 0));
    const availableHeight = Math.max(1, contentHeight - overhead);
    let stop = start + availableHeight;
    if (stop < end) {
      const crossing = blocks.find(block => block.top < stop && block.bottom > stop);
      if (crossing) {
        const fits = crossing.bottom - crossing.top <= contentHeight;
        if ((mode === "whitespace" || crossing.atomic) && fits && crossing.top > start + 1) {
          stop = crossing.top;
        } else {
          // Staging measurements and positioned page clones can differ by a
          // fractional pixel; leave a small buffer so glyphs at the cut do not
          // get clipped by the page body's overflow boundary.
          const lines = crossing.breakpoints.filter(y => y <= stop - LINE_BREAK_SAFETY && y > start + availableHeight * 0.3);
          if (lines.length) stop = Math.max(...lines);
        }
      }
      // Headings (and "…：" lead-ins) go with what follows; walk back over a
      // run of them so an H2 is not stranded above an H3 moved to the next page.
      // A cut inside a long block already keeps its lead-in with visible
      // content. Moving that lead-in backward would create a heading-only
      // page before the same long block on the next iteration.
      const continuesContent = blocks.some(block => !block.leadIn && block.top < stop - 0.5 && block.bottom > stop + 0.5);
      const before = continuesContent ? [] : blocks.filter(block => block.bottom <= stop + 0.5 && block.top >= start);
      for (let index = before.length - 1; index >= 0; index -= 1) {
        const last = before[index];
        if (!last.leadIn || last.top <= start + 1 || last.bottom > stop + 0.5) break;
        stop = last.top;
      }
    }
    windows.push({ start, stop: Math.min(stop, end) });
    start = stop;
    const next = blocks.find(block => block.bottom > start + 0.5);
    if (next && next.top > start) start = next.top;
  }
  return windows;
}
