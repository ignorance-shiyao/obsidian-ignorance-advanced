import { describe, expect, it } from "vitest";
import { MAX_SCALE, MIN_SCALE, centred, fitScale, neighbour, wheelFactor, zoomAt } from "./content-viewer-core.js";

describe("fitScale", () => {
  it("shrinks large content to fit and never enlarges small content", () => {
    expect(fitScale(2000, 1000, 1000, 800)).toBe(0.5);
    expect(fitScale(400, 300, 1000, 800)).toBe(1);
  });
  it("falls back to 1 on empty sizes", () => {
    expect(fitScale(0, 100, 1000, 800)).toBe(1);
    expect(fitScale(100, 100, 0, 800)).toBe(1);
  });
});

describe("centred", () => {
  it("puts the scaled content in the middle", () => {
    expect(centred(400, 200, 1000, 600, 1)).toEqual({ scale: 1, x: 300, y: 200 });
    expect(centred(2000, 1000, 1000, 600, 0.5)).toEqual({ scale: 0.5, x: 0, y: 50 });
  });
});

describe("zoomAt", () => {
  it("keeps the point under the cursor fixed", () => {
    const before = { scale: 1, x: 100, y: 50 };
    const after = zoomAt(before, 2, 300, 250);
    // content point under the cursor before and after
    const px = (300 - before.x) / before.scale, py = (250 - before.y) / before.scale;
    expect(after.x + px * after.scale).toBeCloseTo(300);
    expect(after.y + py * after.scale).toBeCloseTo(250);
    expect(after.scale).toBe(2);
  });
  it("clamps the scale", () => {
    expect(zoomAt({ scale: 7, x: 0, y: 0 }, 5, 0, 0).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 0.6, x: 0, y: 0 }, 0.1, 0, 0).scale).toBe(MIN_SCALE);
  });
});

describe("wheelFactor", () => {
  it("zooms in on negative deltas and out on positive ones", () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(0)).toBe(1);
  });
});

describe("neighbour", () => {
  it("stops at both ends", () => {
    expect(neighbour(0, 3, -1)).toBe(0);
    expect(neighbour(2, 3, 1)).toBe(2);
    expect(neighbour(1, 3, 1)).toBe(2);
  });
});
