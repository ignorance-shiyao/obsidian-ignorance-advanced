// A code block or chart can carry an authored width, written on its fence as `{width=480}`.
export const MIN_BLOCK_WIDTH = 200;
export function chartWidth(fence: string): number { return Number(fence.match(/\{width=(\d{2,4})\}/)?.[1]) || 0; }
export function withChartWidth(fence: string, width: number): string {
  const clean = fence.replace(/\s*\{width=\d+\}/g, "").trimEnd();
  return width > 0 ? `${clean} {width=${Math.round(width)}}` : clean;
}
// Pure CSS: the rule in styles.css reads the variable, so exports and readers can copy the attribute.
export function setBlockWidth(element: HTMLElement, width: number) {
  if (width > 0) { element.dataset.ibChartWidth = String(Math.round(width)); element.style.setProperty("--ib-chart-width", `${Math.round(width)}px`); }
  else { delete element.dataset.ibChartWidth; element.style.removeProperty("--ib-chart-width"); }
}
