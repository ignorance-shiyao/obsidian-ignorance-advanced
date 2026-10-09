import { describe, expect, it } from "vitest";
import { avoidC4LabelNodes } from "./c4-label-layout";

const bounds = { x: 0, y: 0, width: 1000, height: 600 };
describe("C4 relation labels", () => {
  it("keeps an unobstructed label in its original position", () => {
    expect(avoidC4LabelNodes({ x: 20, y: 20, width: 80, height: 20 }, [{ x: 200, y: 200, width: 100, height: 100 }], bounds)).toEqual({ dx: 0, dy: 0 });
  });
  it("moves an overlapping long label clear of a system card", () => {
    const label = { x: 390, y: 260, width: 170, height: 20 };
    const node = { x: 466, y: 188, width: 216, height: 127 };
    const shift = avoidC4LabelNodes(label, [node], bounds);
    expect(shift).toEqual({ dx: 0, dy: 63 });
    expect(label.y + shift.dy).toBeGreaterThanOrEqual(node.y + node.height + 8);
  });
  it("finds space above two cards when there is no horizontal gap", () => {
    const label = { x: 220, y: 200, width: 180, height: 20 };
    const nodes = [{ x: 0, y: 160, width: 250, height: 100 }, { x: 300, y: 160, width: 250, height: 100 }];
    expect(avoidC4LabelNodes(label, nodes, bounds)).toEqual({ dx: 0, dy: -68 });
  });
});
