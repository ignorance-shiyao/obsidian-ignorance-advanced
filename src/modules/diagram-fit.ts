// CSS pixels at 96dpi: half an A4 sheet is 148.5mm ≈ 561px.
// Include the shared 46px header (including borders) and 16px canvas gutter in that budget.
export const HALF_A4_HEIGHT = 561;
export const DIAGRAM_HEADER_HEIGHT = 46;
export const DIAGRAM_GUTTER = 16;

export function diagramFit(width: number, height: number, availableWidth: number, viewportHeight: number) {
  const widthScale = Math.min(1, Math.max(1, availableWidth) / Math.max(1, width));
  const ordinaryCanvas = Math.max(140, Math.min(HALF_A4_HEIGHT - DIAGRAM_HEADER_HEIGHT, viewportHeight * .72 - DIAGRAM_HEADER_HEIGHT));
  // A vertically stacked C4 can be twice as tall as wide without reaching
  // 2.5:1. Treat elongated portrait drawings as long before the half-page
  // cap makes their labels unreadable; width fitting still shows everything.
  const long = height / Math.max(1, width) >= 1.5 && height * widthScale + DIAGRAM_GUTTER > ordinaryCanvas;
  const scale = Math.max(.001, long ? widthScale : Math.min(widthScale, (ordinaryCanvas - DIAGRAM_GUTTER) / Math.max(1, height)));
  return { scale, long, canvasLimit: long ? height * scale + DIAGRAM_GUTTER : ordinaryCanvas };
}
