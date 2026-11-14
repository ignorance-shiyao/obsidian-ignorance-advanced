import { describe, expect, it } from "vitest";
import { isSameNoteLink } from "./back-to-origin.js";

describe("isSameNoteLink", () => {
  it("accepts in-note anchors", () => {
    expect(isSameNoteLink("#标题", "Note")).toBe(true);
    expect(isSameNoteLink("Note#^abc", "Note")).toBe(true);
    expect(isSameNoteLink("dir/Note.md#x", "Note")).toBe(true);
  });
  it("rejects other notes and plain links", () => {
    expect(isSameNoteLink("Other#x", "Note")).toBe(false);
    expect(isSameNoteLink("Note", "Note")).toBe(false);
    expect(isSameNoteLink("", "Note")).toBe(false);
  });
});
