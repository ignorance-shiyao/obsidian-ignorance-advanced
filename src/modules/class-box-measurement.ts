export function classBoxBounds(box, groups, padding = 8) {
  // Header text is later placed beside a 44px icon inset. The outline adds
  // padding on both sides; reserve the remainder plus an 8px right gutter.
  const headerSpace = Math.max(0, 44 + 8 - padding * 2);
  const width = Math.max(...groups.map(group => group.width + (group.header ? headerSpace : 0)));
  return Number.isFinite(width) && width > 0 ? { x:box.x, y:box.y, width, height:box.height } : box;
}

// Mermaid measures a centered header together with members still at x=0.
// That union counts half the header width as empty space. Only adapt the
// unfinished class box in this render's scratch SVG, before edge routing.
export async function withClassBoxMeasurement(engine, id, source, draw, prototype = globalThis.SVGGraphicsElement?.prototype) {
  if (!/^\s*classDiagram(?:-v2)?\b/m.test(source)) return draw();
  const original = prototype?.getBBox;
  if (typeof original !== 'function' || !Object.getOwnPropertyDescriptor(prototype, 'getBBox')?.writable) return draw();
  let padding;
  const adapted = function(...args) {
    const box = original.apply(this, args);
    if (this.ownerSVGElement?.id !== id || !this.matches('g.node') ||
        !this.querySelector(':scope > .members-group') || this.querySelector(':scope > .label-container')) return box;
    padding ??= Number(engine.mermaidAPI?.getConfig()?.class?.padding ?? 12);
    const groups = [...this.children].filter(child => child.matches('.label-group,.annotation-group,.members-group,.methods-group'))
      .map(child => ({ width:original.apply(child, args).width, header:child.matches('.label-group,.annotation-group') }));
    return classBoxBounds(box, groups, Number.isFinite(padding) ? padding : 12);
  };
  prototype.getBBox = adapted;
  try { return await draw(); }
  finally { if (prototype.getBBox === adapted) prototype.getBBox = original; }
}
