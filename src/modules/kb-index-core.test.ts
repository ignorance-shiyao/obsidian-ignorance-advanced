import { describe, expect, it } from "vitest";
import { KB_DEFAULT_FOLDERS, areaOf, parseTaskDue, backlinkCounts, buildNote, frontmatterTags, isExcluded, normalizeKbSettings, topicOf } from "./kb-index-core.js";

const folders = normalizeKbSettings(undefined).folders;

describe("kb index core", () => {
  it("defaults every feature off and keeps the default folders", () => {
    const s = normalizeKbSettings(undefined);
    expect(Object.values(s.features).every(v => v === false)).toBe(true);
    expect(s.openHomeOnStartup).toBe(false);
    expect(s.folders).toEqual({ ...KB_DEFAULT_FOLDERS, exclude: [...KB_DEFAULT_FOLDERS.exclude] });
  });
  it("cleans stored folders", () => {
    const s = normalizeKbSettings({ folders: { work: " /Work/ ", exclude: ["a/", "", 3] }, features: { home: true, map: "yes" } });
    expect(s.folders.work).toBe("Work");
    expect(s.folders.exclude).toEqual(["a"]);
    expect(s.features.home).toBe(true);
    expect(s.features.map).toBe(false);
  });
  it("classifies areas with the deepest folder winning", () => {
    expect(areaOf("00-收件箱/剪藏/a.md", folders)).toBe("inbox");
    expect(areaOf("00-收件箱/日记/a.md", folders)).toBe("other");
    expect(areaOf("10-工作x/a.md", folders)).toBe("other");
    expect(areaOf("10-工作/5G/a.md", folders)).toBe("work");
    expect(areaOf(`${folders.archive}/x/a.md`, { ...folders, inbox: `${folders.archive}/x` })).toBe("inbox");
  });
  it("excludes folders and finds topics", () => {
    expect(isExcluded(`${folders.exclude[0]}/samples/a.md`, folders)).toBe(true);
    expect(isExcluded(`${folders.archive}/a.md`, folders)).toBe(false);
    expect(topicOf("10-工作/5G 管家/x/y.md", "10-工作")).toBe("10-工作/5G 管家");
    expect(topicOf("10-工作/README.md", "10-工作")).toBe("");
  });
  it("reads Tasks due dates", () => {
    expect(parseTaskDue("- [ ] call 📅 2026-11-20 ⏫")).toBe(new Date(2026, 10, 20).getTime());
    expect(parseTaskDue("- [ ] call 2026-11-20")).toBeNull();
  });
  it("treats a note with only frontmatter as empty", () => {
    expect(buildNote({ path: "a.md", ctime: 0, mtime: 0, size: 30, sections: ["yaml"] }, folders).bodyEmpty).toBe(true);
    expect(buildNote({ path: "a.md", ctime: 0, mtime: 0, size: 0 }, folders).bodyEmpty).toBe(true);
  });
  it("keeps thresholds and ignored findings", () => {
    const s = normalizeKbSettings({ thresholds: { inboxStaleDays: "45", overdueMin: -1 }, openHomeOnStartup: true, ignored: ["orphan:a.md", 3] });
    expect(s.thresholds).toEqual({ inboxStaleDays: 45, overdueMin: 0, productStaleDays: 14 });
    expect(s.openHomeOnStartup).toBe(true);
    expect(s.ignored).toEqual(["orphan:a.md"]);
  });
  it("reads tags in every frontmatter shape", () => {
    expect(frontmatterTags({ tags: ["#AI", "agent"], tag: "x, y" })).toEqual(["ai", "agent", "x", "y"]);
    expect(frontmatterTags(null)).toEqual([]);
  });
  it("builds a note from metadata only", () => {
    const note = buildNote({ path: "30-知识/AI/n.md", ctime: 1, mtime: 2, size: 3, frontmatter: { tags: "ai" }, tags: ["#AI", "#rag"], links: { "a.md": 1, "30-知识/AI/n.md": 1 }, unresolved: { x: 2, y: 1 }, tasks: [{ mark: " ", line: 4 }, { mark: "x", line: 5 }, { mark: "/", line: 6 }, { mark: "-", line: 7 }], sections: ["yaml", "paragraph"] }, folders);
    expect(note).toMatchObject({ title: "n", area: "knowledge", topic: "30-知识/AI", tags: ["ai", "rag"], links: ["a.md"], unresolved: 3, unresolvedTargets: ["x", "y"], hasFrontmatter: true, bodyEmpty: false, tasks: 4, openTasks: 2, openTaskLines: [4, 6] });
    expect(backlinkCounts([note]).get("a.md")).toBe(1);
  });
});
