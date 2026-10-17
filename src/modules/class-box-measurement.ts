interface Bounds { x: number; y: number; width: number; height: number }
interface CompartmentGroup { width: number; header: boolean }
// The parts of an SVG node this measurement touches; real SVG elements satisfy it.
interface MeasuredNode {
  ownerSVGElement?: { id: string } | null;
  matches(selector: string): boolean;
  querySelector(selector: string): unknown;
  children: Iterable<MeasuredNode>;
}
interface BBoxPrototype {
  getBBox: (this: MeasuredNode, ...args: unknown[]) => Bounds;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

export function classBoxBounds<T extends Bounds>(box: T, groups: CompartmentGroup[], padding = 8): T | Bounds {
  // Header text is later placed beside a 44px icon inset. The outline adds
  // padding on both sides; reserve the remainder plus an 8px right gutter.
  const headerSpace = Math.max(0, 44 + 8 - padding * 2);
  const width = Math.max(...groups.map(group => group.width + (group.header ? headerSpace : 0)));
  return Number.isFinite(width) && width > 0 ? { x:box.x, y:box.y, width, height:box.height } : box;
}

// Mermaid's configured class padding, when the engine exposes its config.
function configuredPadding(engine: object): unknown {
  const api: unknown = "mermaidAPI" in engine ? engine.mermaidAPI : undefined;
  if (!isRecord(api) || typeof api.getConfig !== "function") return undefined;
  const config: unknown = Reflect.apply(api.getConfig, api, []);
  const classConfig = isRecord(config) ? config.class : undefined;
  return isRecord(classConfig) ? classConfig.padding : undefined;
}

// Mermaid measures a centered header together with members still at x=0.
// That union counts half the header width as empty space. Only adapt the
// unfinished class box in this render's scratch SVG, before edge routing.
export async function withClassBoxMeasurement<T>(engine: object, id: string, source: string, draw: () => T | Promise<T>, prototype: BBoxPrototype = window.SVGGraphicsElement?.prototype): Promise<T> {
  if (!/^\s*classDiagram(?:-v2)?\b/m.test(source)) return draw();
  const original = prototype?.getBBox;
  if (typeof original !== 'function' || !Object.getOwnPropertyDescriptor(prototype, 'getBBox')?.writable) return draw();
  let padding: number | undefined;
  const adapted = function(this: MeasuredNode, ...args: unknown[]) {
    const box = Reflect.apply(original, this, args);
    if (this.ownerSVGElement?.id !== id || !this.matches('g.node') ||
        !this.querySelector(':scope > .members-group') || this.querySelector(':scope > .label-container')) return box;
    padding ??= Number(configuredPadding(engine) ?? 12);
    const groups = [...this.children].filter(child => child.matches('.label-group,.annotation-group,.members-group,.methods-group'))
      .map(child => ({ width:Reflect.apply(original, child, args).width, header:child.matches('.label-group,.annotation-group') }));
    return classBoxBounds(box, groups, Number.isFinite(padding) ? padding : 12);
  };
  prototype.getBBox = adapted;
  try { return await draw(); }
  finally { if (prototype.getBBox === adapted) prototype.getBBox = original; }
}
