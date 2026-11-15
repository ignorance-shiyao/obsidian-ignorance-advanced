import { describe, expect, it } from "vitest";
import { exportFileName, exportLocation } from "./export-done-core.js";

describe("exportLocation", () => {
  it("joins a vault path onto the vault folder", () => {
    expect(exportLocation("导出/a.pdf", "/home/u/vault")).toEqual({ absolute: "/home/u/vault/导出/a.pdf", inVault: true });
  });
  it("keeps an absolute path, noting whether it is inside the vault", () => {
    expect(exportLocation("/home/u/vault/x.docx", "/home/u/vault").inVault).toBe(true);
    expect(exportLocation("/home/u/Desktop/x.docx", "/home/u/vault")).toEqual({ absolute: "/home/u/Desktop/x.docx", inVault: false });
    expect(exportLocation("C:\\out\\x.docx", "C:/vault").inVault).toBe(false);
  });
});

describe("exportFileName", () => {
  it("takes the last segment", () => {
    expect(exportFileName("导出/a b.pdf")).toBe("a b.pdf");
    expect(exportFileName("C:\\out\\x.docx")).toBe("x.docx");
  });
});
