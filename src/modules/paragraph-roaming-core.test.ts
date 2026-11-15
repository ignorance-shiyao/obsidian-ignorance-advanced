import { describe, expect, it } from "vitest";
import { moveRoam, nearestBlock, roamStep } from "./paragraph-roaming-core.js";

const keys = (over: Partial<Record<"shiftKey" | "metaKey" | "ctrlKey" | "altKey", boolean>> = {}) => ({ shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...over });

describe("roamStep", () => {
  it("moves one block, five with Ctrl or Command, ten with Shift", () => {
    expect(roamStep(keys())).toBe(1);
    expect(roamStep(keys({ ctrlKey: true }))).toBe(5);
    expect(roamStep(keys({ metaKey: true }))).toBe(5);
    expect(roamStep(keys({ shiftKey: true }))).toBe(10);
  });
  it("ignores Alt combinations", () => {
    expect(roamStep(keys({ altKey: true }))).toBe(0);
    expect(roamStep(keys({ altKey: true, shiftKey: true }))).toBe(0);
  });
});

describe("moveRoam", () => {
  it("stays inside the list", () => {
    expect(moveRoam(0, 5, -1, 1)).toBe(0);
    expect(moveRoam(4, 5, 1, 1)).toBe(4);
    expect(moveRoam(2, 5, 1, 10)).toBe(4);
    expect(moveRoam(2, 5, -1, 5)).toBe(0);
    expect(moveRoam(1, 5, 1, 2)).toBe(3);
  });
  it("handles an empty list", () => {
    expect(moveRoam(3, 0, 1, 1)).toBe(0);
  });
});

describe("nearestBlock", () => {
  it("picks the first block that ends below the line", () => {
    expect(nearestBlock([100, 220, 340], 200)).toBe(1);
    expect(nearestBlock([100, 220, 340], 50)).toBe(0);
  });
  it("falls back to the last block when all end above", () => {
    expect(nearestBlock([100, 220, 340], 900)).toBe(2);
    expect(nearestBlock([], 10)).toBe(0);
  });
});
