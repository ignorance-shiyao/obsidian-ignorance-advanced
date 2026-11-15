import { describe, expect, it } from "vitest";
import { exportFileName, exportLocation } from "./export-done-core.js";

describe("exportLocation", () => {
  it("joins a vault path onto the vault folder", () => {
    expect(exportLocation("导出/a.pdf", "/Users/me/vault")).toEqual({ absolute: "/Users/me/vault/导出/a.pdf", inVault: true });
  });
  it("keeps an absolute path, noting whether it is inside the vault", () => {
    expect(exportLocation("/Users/me/vault/x.docx", "/Users/me/vault").inVault).toBe(true);
    expect(exportLocation("/Users/me/Desktop/x.docx", "/Users/me/vault")).toEqual({ absolute: "/Users/me/Desktop/x.docx", inVault: false });
    expect(exportLocation("C:\\out\\x.docx", "C:/vault").inVault).toBe(false);
  });
});

describe("exportFileName", () => {
  it("takes the last segment", () => {
    expect(exportFileName("导出/a b.pdf")).toBe("a b.pdf");
    expect(exportFileName("C:\\out\\x.docx")).toBe("x.docx");
  });
});
