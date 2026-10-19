import { describe, expect, it } from "vitest";
import { settleVerdict } from "./render-ready";

const base = { started: 0, quiet: 250, ceiling: 10000, pendingImages: 0 };

describe("settleVerdict", () => {
  it("waits while the page is still changing", () => {
    expect(settleVerdict({ ...base, now: 300, lastChange: 200 })).toBeNull();
  });
  it("is ready after a quiet period with every image loaded", () => {
    expect(settleVerdict({ ...base, now: 600, lastChange: 300 })).toBe("ready");
  });
  it("keeps waiting for images even when the DOM is quiet", () => {
    expect(settleVerdict({ ...base, now: 2000, lastChange: 100, pendingImages: 2 })).toBeNull();
  });
  it("gives up at the ceiling, reporting it", () => {
    expect(settleVerdict({ ...base, now: 10000, lastChange: 9990, pendingImages: 1 })).toBe("ceiling");
  });
});
