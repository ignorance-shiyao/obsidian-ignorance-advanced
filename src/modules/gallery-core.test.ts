import { describe, expect, it } from "vitest";
import { NOTE_CLASSES, galleryText } from "./gallery-core";

describe("feature gallery", () => {
  for (const language of ["zh", "en"] as const) {
    it(`lists every note class and every task status (${language})`, () => {
      const text = galleryText(language);
      for (const item of NOTE_CLASSES) expect(text).toContain(`\`${item.name}\``);
      for (const mark of ["-", ">", "<", "?", "!", "*", "i", "b", "\""]) expect(text).toContain(`- [${mark}] `);
      for (const type of ["decision", "risk", "definition", "idea", "aside"]) expect(text).toContain(`> [!${type}]`);
    });
    it(`has well-formed front matter and a table with equal columns (${language})`, () => {
      const text = galleryText(language);
      expect(text.startsWith("---\ncssclasses: [ib-wide-tables]\n---\n# ")).toBe(true);
      const widths = text.split("\n").filter(line => line.startsWith("| ")).map(line => line.split("|").length);
      expect(new Set(widths).size).toBe(2); // the 3-column class table and the 12-column wide table
    });
  }
  it("says where each class comes from", () => {
    expect(NOTE_CLASSES.every(item => item.source === "theme" || item.source === "plugin")).toBe(true);
    expect(galleryText("en")).toContain("Theme only");
    expect(galleryText("zh")).toContain("需插件");
  });
});
