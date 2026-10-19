import { describe, expect, it } from "vitest";
import { bannerTarget, isRemote } from "./reading-banner";

describe("banner property", () => {
  it("reads wiki links, plain paths and sized embeds", () => {
    expect(bannerTarget("[[cover.png]]")).toBe("cover.png");
    expect(bannerTarget("![[img/a.jpg|400]]")).toBe("img/a.jpg");
    expect(bannerTarget(" b.png ")).toBe("b.png");
  });
  it("ignores empty and non-text values", () => {
    expect(bannerTarget(undefined)).toBe("");
    expect(bannerTarget(5)).toBe("");
  });
  it("detects web addresses", () => {
    expect(isRemote("https://x.test/a.png")).toBe(true);
    expect(isRemote("a.png")).toBe(false);
  });
});
