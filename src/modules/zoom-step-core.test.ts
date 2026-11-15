import { describe, expect, it } from "vitest";
import { wheelZoomFactor, wheelZoomStep } from "./zoom-step-core.js";

describe("wheelZoomStep", () => {
  it("caps a mouse notch at 3%", () => {
    expect(wheelZoomStep(100)).toBeCloseTo(0.03);
    expect(wheelZoomStep(-400)).toBeCloseTo(0.03);
  });
  it("keeps small trackpad deltas proportional", () => {
    expect(wheelZoomStep(10)).toBeCloseTo(0.008);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in on scroll up and out on scroll down", () => {
    expect(wheelZoomFactor(-100)).toBeCloseTo(1.03);
    expect(wheelZoomFactor(100)).toBeCloseTo(0.97);
  });
  it("does nothing for a zero delta", () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });
});
