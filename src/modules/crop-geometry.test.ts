import { describe, expect, it } from "vitest";

import { adjustBox, fitBoxToRatio } from "./crop-geometry.js";

const bounds = { w: 400, h: 300 };
describe("crop geometry", () => {
  it("moves inside the image and stops at the edges", () => {
    expect(adjustBox({ x: 10, y: 10, w: 100, h: 80 }, "move", -50, 500, bounds)).toEqual({ x: 0, y: 220, w: 100, h: 80 });
  });
  it("resizes from a corner and keeps a minimum size", () => {
    const grown = adjustBox({ x: 100, y: 100, w: 100, h: 100 }, "se", 50, 20, bounds);
    expect(grown).toEqual({ x: 100, y: 100, w: 150, h: 120 });
    expect(adjustBox({ x: 100, y: 100, w: 100, h: 100 }, "se", -500, -500, bounds).w).toBe(16);
  });
  it("holds the aspect ratio while resizing", () => {
    const box = adjustBox({ x: 100, y: 100, w: 100, h: 100 }, "e", 60, 0, bounds, 2);
    expect(box.w / box.h).toBeCloseTo(2);
  });
  it("fits an existing box to a new ratio inside the bounds", () => {
    const box = fitBoxToRatio({ x: 0, y: 0, w: 400, h: 300 }, 1, bounds);
    expect(box.w).toBe(box.h);
    expect(box.w).toBeLessThanOrEqual(300);
  });
});
