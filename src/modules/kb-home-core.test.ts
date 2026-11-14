import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { computeDashboard, idleDays } from "./kb-home-core.js";
import { activityDays, parseRange } from "./kb-activity-core.js";

const folders = normalizeKbSettings(undefined).folders;
const NOW = new Date(2026, 10, 15, 12).getTime();
const TODAY = new Date(2026, 10, 15).getTime();
const days = (n: number) => NOW - n * 86_400_000;
const note = (path: string, ctime: number, mtime = ctime, open = 0) =>
  buildNote({ path, ctime, mtime, size: 10, tasks: Array.from({ length: open }, (_, line) => ({ mark: " ", line })) }, folders);

describe("kb home", () => {
  it("counts calendar days", () => {
    expect(idleDays(NOW, days(0))).toBe(0);
    expect(idleDays(NOW, days(31))).toBe(31);
  });
  it("raises attention at the thresholds", () => {
    const notes = [
      note("00-收件箱/剪藏/old.md", days(31)),
      note("00-收件箱/剪藏/edge.md", days(30)),
      note("00-收件箱/剪藏/new.md", days(1)),
      note("10-工作/A/a.md", days(40), days(15)),
      note("10-工作/B/b.md", days(40), days(14)),
      note("20-个人/t.md", days(3), days(0), 3),
      note("20-个人/u.md", days(3), days(0), 1)
    ];
    const dues = new Map([["20-个人/t.md", [days(1), TODAY, null]], ["20-个人/u.md", [TODAY + 86_400_000]]]);
    const d = computeDashboard(notes, NOW, dues);
    expect(d.total).toBe(7);
    expect(d.inbox).toEqual(["00-收件箱/剪藏/old.md", "00-收件箱/剪藏/edge.md", "00-收件箱/剪藏/new.md"]);
    expect(d.inboxStale).toEqual(["00-收件箱/剪藏/old.md"]);
    expect([d.openTaskCount, d.dueTodayCount, d.overdueCount]).toEqual([4, 1, 1]);
    expect(d.weekCreated.length).toBe(3);
    expect(d.attention.map(a => [a.kind, a.count])).toEqual([["inbox", 1], ["overdue", 1], ["stale", 15]]);
    expect(d.attention[2].topic).toBe("10-工作/A");
    expect(d.products.map(p => p.name)).toEqual(["B", "A"]);
    expect(d.products[0].recent.map(n => n.title)).toEqual(["b"]);
    expect(d.recent[0].path.startsWith("20-个人")).toBe(true);
  });
  it("follows custom thresholds", () => {
    const d = computeDashboard([note("00-收件箱/剪藏/old.md", days(31)), note("10-工作/A/a.md", days(40), days(15))], NOW, new Map(), { inboxStaleDays: 40, overdueMin: 0, productStaleDays: 20 });
    expect(d.attention).toEqual([]);
  });
});

describe("activity", () => {
  it("counts a note once per day", () => {
    const n = note("a.md", days(0), days(0));
    const m = note("b.md", days(2), days(0));
    const map = activityDays([n, m], "both", days(3), NOW);
    expect(map.size).toBe(4);
    expect(map.get([...map.keys()][3])?.paths).toEqual(["a.md", "b.md"]);
    expect(map.get([...map.keys()][1])?.paths).toEqual(["b.md"]);
    expect(activityDays([n, m], "created", days(3), NOW, "x").get([...map.keys()][3])?.paths).toEqual([]);
  });
  it("parses ranges", () => {
    expect(parseRange("12w")).toBe(84);
    expect(parseRange("6m")).toBe(180);
    expect(parseRange("1y")).toBe(365);
    expect(parseRange("90")).toBe(90);
    expect(parseRange("x")).toBe(365);
  });
});
