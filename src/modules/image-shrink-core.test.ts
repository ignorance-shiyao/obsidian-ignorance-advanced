import { describe, expect, it } from "vitest";
import { canShrink, pickSmaller, SHRINK_MAX_PIXELS } from "./image-shrink-core.js";

describe("canShrink", () => {
  it("accepts PNG, JPEG and BMP on desktop", () => {
    for (const mime of ["image/png", "image/jpeg", "image/bmp"]) expect(canShrink(mime, 800, 600, false)).toBe(true);
  });
  it("leaves GIF, SVG and WebP alone", () => {
    for (const mime of ["image/gif", "image/svg+xml", "image/webp"]) expect(canShrink(mime, 800, 600, false)).toBe(false);
  });
  it("skips phones and oversize pictures", () => {
    expect(canShrink("image/png", 800, 600, true)).toBe(false);
    expect(canShrink("image/png", SHRINK_MAX_PIXELS, 2, false)).toBe(false);
    expect(canShrink("image/png", 0, 600, false)).toBe(false);
  });
});

describe("pickSmaller", () => {
  const original = { size: 100, type: "image/png" };
  it("takes a smaller WebP", () => {
    const webp = { size: 60, type: "image/webp" };
    expect(pickSmaller(original, webp)).toBe(webp);
  });
  it("keeps the original on a tie, a larger result or a failed encode", () => {
    expect(pickSmaller(original, { size: 100, type: "image/webp" })).toBe(original);
    expect(pickSmaller(original, { size: 140, type: "image/webp" })).toBe(original);
    expect(pickSmaller(original, { size: 10, type: "image/png" })).toBe(original);
    expect(pickSmaller(original, null)).toBe(original);
  });
});
