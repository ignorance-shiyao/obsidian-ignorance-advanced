import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { groupFindings, ignoreKey, remoteImages, runChecks } from "./kb-health-core.js";

const folders = normalizeKbSettings(undefined).folders;
const NOW = new Date(2026, 10, 15, 12).getTime();
const D = 86_400_000;

describe("health", () => {
  it("finds remote images outside code", () => {
    expect(remoteImages("![a](https://x/a.png)\n`![b](http://y)`\n```\n![c](http://z)\n```\n<img src=\"http://w/i.jpg\">\n![](local.png)")).toEqual(["https://x/a.png", "http://w/i.jpg"]);
  });
  it("runs every check", () => {
    const notes = [
      buildNote({ path: "20-个人/a.md", ctime: NOW, mtime: NOW, size: 9, unresolved: { gone: 1 }, sections: ["paragraph"] }, folders),
      buildNote({ path: "40-归档/b.md", ctime: NOW, mtime: NOW, size: 9, unresolved: { gone: 1 }, sections: ["paragraph"] }, folders),
      buildNote({ path: "00-收件箱/剪藏/c.md", ctime: NOW - 40 * D, mtime: NOW, size: 9, sections: ["yaml"], frontmatter: { title: "c" } }, folders),
      buildNote({ path: "00-收件箱/剪藏/d.md", ctime: NOW, mtime: NOW, size: 9, frontmatter: { url: "https://x" }, sections: ["paragraph"] }, folders),
      buildNote({ path: "30-知识/T/e.md", ctime: NOW, mtime: NOW, size: 9, links: { "30-知识/T/f.md": 1 }, sections: ["paragraph"] }, folders),
      buildNote({ path: "30-知识/T/f.md", ctime: NOW, mtime: NOW, size: 9, sections: ["paragraph"] }, folders)
    ];
    const findings = runChecks(notes, NOW, 30, new Map([["20-个人/a.md", ["http://i"]]]));
    expect(findings.map(f => `${f.check}:${f.path}`)).toEqual([
      "broken:20-个人/a.md", "remoteImage:20-个人/a.md", "noSource:00-收件箱/剪藏/c.md", "empty:00-收件箱/剪藏/c.md", "stale:00-收件箱/剪藏/c.md", "orphan:30-知识/T/e.md"
    ]);
    const groups = groupFindings(findings, new Set([ignoreKey("orphan", "30-知识/T/e.md")]));
    expect(groups.orphan).toEqual({ open: [], ignored: [findings[5]] });
    expect(groups.broken.open[0].detail).toEqual(["gone"]);
  });
});
