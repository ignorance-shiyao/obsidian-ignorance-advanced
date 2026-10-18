import { afterEach, describe, expect, it, vi } from "vitest";
import { controlBox, controlScale } from "./control-geometry.js";

const zooms = new WeakMap<Element, string>();
function node(zoom = "1", parent: HTMLElement | null = null, extra: Partial<HTMLElement> = {}) {
  // The measurement reads only the parent, rectangle and scroll/border fields.
  const element = Object.assign({ parentElement: parent } as HTMLElement, extra);
  zooms.set(element, zoom);
  return element;
}
function rect(left: number, top: number, width = 0, height = 0): DOMRect {
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({ left, top, width, height }) };
}
afterEach(() => vi.unstubAllGlobals());
function styles() { vi.stubGlobal("getComputedStyle", (element: Element) => ({ getPropertyValue: () => zooms.get(element) || "1" })); }
describe("zoomed controls", () => {
  it("combines nested fractional and percentage zoom without rounded offset sizes", () => {
    styles();
    expect(controlScale(node("80%", node("1.5", node("normal"))))).toBeCloseTo(1.2);
  });
  it.each([0.5, 1, 1.5, 2, 3])("maps screen geometry into a bordered, scrolled host at zoom %s", zoom => {
    styles();
    const host = node(String(zoom), null, { clientLeft: 2, clientTop: 3, scrollLeft: 17, scrollTop: 29,
      getBoundingClientRect: () => rect(80, 100) });
    const element = node("1", host, { getBoundingClientRect: () => rect(80 + 42 * zoom, 100 + 53 * zoom, 211.25 * zoom, 87.5 * zoom) });
    expect(controlBox(element, host)).toEqual({ left: 57, top: 79, width: 211.25, height: 87.5 });
    expect(30 * zoom / controlScale(element)).toBeCloseTo(30);
  });
});
