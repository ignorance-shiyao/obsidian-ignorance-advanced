import { describe, expect, it } from "vitest";
import { customCalloutCss, parseCustomCallouts } from "./custom-callouts-core";

describe("custom callouts", () => {
  it("reads name, colour and icon, and reports what it ignored", () => {
    const { callouts, ignored } = parseCustomCallouts("faq | #7C5CFF | help-circle\n决定 | warning\n坏 名字 | #fff\nfaq | #000\nnocolor | red\nx | #123 | Bad Icon\n\n  idea | success | lucide-lightbulb ");
    expect(callouts).toEqual([
      { name: "faq", color: "#7c5cff", icon: "help-circle" },
      { name: "决定", color: "warning", icon: "" },
      { name: "idea", color: "success", icon: "lightbulb" }
    ]);
    expect(ignored).toEqual(["坏 名字 | #fff", "faq | #000", "nocolor | red", "x | #123 | Bad Icon"]);
  });
  it("writes a rule per callout, using palettes or a mix with the paper", () => {
    const css = customCalloutCss([{ name: "faq", color: "#7c5cff", icon: "help-circle" }, { name: "risk2", color: "warning", icon: "" }]);
    expect(css).toContain('.callout[data-callout="faq" i] { --callout-icon: lucide-help-circle; --ib-callout-semantic-text: #7c5cff;');
    expect(css).toContain("color-mix(in srgb, #7c5cff 10%, var(--ib-bg-primary))");
    expect(css).toContain("background: var(--ib-warning-bg);");
    expect(css).toContain('.callout[data-callout="faq" i] > .callout-title > .callout-icon { color: #7c5cff; }');
    expect(css).toContain("{ color: var(--ib-warning-icon); }");
    expect(css).not.toContain("--callout-icon: lucide-;");
  });
  it("empty input gives empty output", () => {
    expect(customCalloutCss([])).toBe("");
    expect(parseCustomCallouts("")).toEqual({ callouts: [], ignored: [] });
  });
});
