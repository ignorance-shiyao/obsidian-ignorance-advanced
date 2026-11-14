import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { heatmapData, heatmapOption, levelSteps, parseHeatmapParams, weekColumns } from "./kb-heatmap-core.js";

const folders = normalizeKbSettings(undefined).folders;
const NOW = new Date(2026, 10, 15, 12).getTime();
const D = 86_400_000;
const note = (path: string, ctime: number, mtime: number) => buildNote({ path, ctime, mtime, size: 1 }, folders);

describe("heatmap", () => {
  it("parses block parameters", () => {
    expect(parseHeatmapParams("range: 12w\nfolder: /30-知识/\nmetric: created")).toEqual({ days: 84, folder: "30-知识", metric: "created" });
    expect(parseHeatmapParams("metric=nope")).toEqual({ days: 365, folder: "", metric: "both" });
  });
  it("counts each note once a day within the range and folder", () => {
    const notes = [note("30-知识/a.md", NOW, NOW), note("30-知识/b.md", NOW - 2 * D, NOW), note("20-个人/c.md", NOW, NOW), note("30-知识/old.md", NOW - 400 * D, NOW - 400 * D)];
    const d = heatmapData(notes, { days: 7, folder: "30-知识", metric: "both" }, NOW);
    expect(d.days.length).toBe(7);
    expect(d.max).toBe(2);
    expect(d.total).toBe(3);
    expect(heatmapData(notes, { days: 7, folder: "", metric: "created" }, NOW).total).toBe(3);
  });
  it("levels by quartiles of active days", () => {
    expect(levelSteps([0, 0])).toEqual([1]);
    expect(levelSteps([1, 1, 1, 1])).toEqual([1]);
    expect(levelSteps([1, 2, 3, 4, 5, 6, 7, 233, 0])).toEqual([2, 4, 6, 233]);
  });
  it("sizes the calendar to the width", () => {
    expect(weekColumns(new Date(2026, 10, 9).getTime(), new Date(2026, 10, 15).getTime())).toBe(1);
    expect(weekColumns(new Date(2026, 10, 10).getTime(), new Date(2026, 10, 16).getTime())).toBe(2);
    const d = heatmapData([], { days: 365, folder: "", metric: "both" }, NOW);
    const { option, height } = heatmapOption(d, { primary: "#4D81EF", text: "#111", muted: "#666", border: "#ddd", background: "#fff" }, 800, { less: "少", more: "多" }, "zh");
    const cal = option.calendar as { cellSize: number[]; range: string[] };
    expect(cal.cellSize[0]).toBe(14);
    expect(cal.range).toEqual(["2025-11-16", "2026-11-15"]);
    expect(height).toBe(26 + 14 * 7 + 44);
  });
});
