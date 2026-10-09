// Reading uses the smallest measured font, including nested SVG transforms.
// Pagination/export keep their own page geometry and do not use this policy.
export function readableDiagramScale(fit: number, minimumFontPx: number | null, target = 10) {
  return minimumFontPx && Number.isFinite(minimumFontPx) && minimumFontPx > 0
    ? Math.max(fit, target / minimumFontPx) : fit;
}

export function measureDiagramFont(svg, currentScale = 1): number | null {
  const sizes: number[] = [];
  for (const element of svg.querySelectorAll("text, tspan, foreignObject *")) {
    // Only elements with their own text; wrapper boxes contain padding and
    // multiple lines and cannot stand in for a font's transformed size.
    if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const font = parseFloat(style.fontSize);
    let factor;
    if (typeof element.getScreenCTM === "function") {
      const matrix = element.getScreenCTM();
      if (matrix) factor = Math.hypot(matrix.c, matrix.d);
    } else if (element.offsetHeight > 0) {
      factor = rect.height / element.offsetHeight;
    } else {
      // Inline HTML labels have no offsetHeight; their foreignObject supplies
      // the SVG-to-screen transform. A local CSS transform needs live audit.
      const matrix = element.closest("foreignObject")?.getScreenCTM?.();
      if (matrix) factor = Math.hypot(matrix.c, matrix.d);
    }
    const size = font * factor / currentScale;
    if (Number.isFinite(size) && size > 0) sizes.push(size);
  }
  return sizes.length ? Math.min(...sizes) : null;
}
