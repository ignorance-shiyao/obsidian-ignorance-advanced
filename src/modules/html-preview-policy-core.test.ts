import { describe, expect, it } from "vitest";
import { previewPolicy } from "./html-preview-policy-core.js";

describe("previewPolicy", () => {
  it("blocks scripts entirely when stopped", () => {
    const policy = previewPolicy(false);
    expect(policy.sandbox).toBe("");
    expect(policy.csp).toContain("script-src 'none'");
  });
  it("runs inline scripts with no same-origin, forms, popups or network when on", () => {
    const policy = previewPolicy(true);
    expect(policy.sandbox).toBe("allow-scripts");
    expect(policy.sandbox).not.toContain("same-origin");
    expect(policy.sandbox).not.toContain("popups");
    expect(policy.csp).toContain("script-src 'unsafe-inline'");
    expect(policy.csp).toContain("default-src 'none'");
    expect(policy.csp).toContain("form-action 'none'");
    expect(policy.csp).not.toMatch(/connect-src/);
  });
  it("never lets a page frame another page or load plugins", () => {
    for (const on of [true, false]) {
      const csp = previewPolicy(on).csp;
      expect(csp).toContain("frame-src 'none'");
      expect(csp).toContain("object-src 'none'");
    }
  });
});
