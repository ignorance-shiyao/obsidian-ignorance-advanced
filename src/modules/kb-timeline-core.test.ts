import { describe, expect, it } from "vitest";
import { buildNote, normalizeKbSettings } from "./kb-index-core.js";
import { buildTimeline, extractDate, filterTimeline, kindName } from "./kb-timeline-core.js";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const CT = d(2026, 9, 1);
const src = (name: string, frontmatter: Record<string, unknown> = {}) => ({ name, frontmatter, ctime: CT });
const folders = normalizeKbSettings(undefined).folders;

describe("extractDate", () => {
  it("prefers frontmatter date, then created", () => {
    expect(extractDate(src("当前进展20240412", { date: "2023-01-02" }))).toBe(d(2023, 1, 2));
    expect(extractDate(src("x", { created: "2022-05-06" }))).toBe(d(2022, 5, 6));
    expect(extractDate(src("x 2025-03-04", { date: "garbage" }))).toBe(d(2025, 3, 4));
  });
  it("reads full dates in file names", () => {
    expect(extractDate(src("当前进展20240412"))).toBe(d(2024, 4, 12));
    expect(extractDate(src("周报 2024.4.1"))).toBe(d(2024, 4, 1));
    expect(extractDate(src("编号 202413999"))).toBeNull();
  });
  it("reads MMDD with the folder's year, else ctime's year", () => {
    expect(extractDate(src("当前进展_0227"))).toBe(d(2026, 2, 27));
    expect(extractDate(src("问题汇总 0327"), 2024)).toBe(d(2024, 3, 27));
    expect(extractDate(src("运维管家需要确认的信息0304"), 2024)).toBe(d(2024, 3, 4));
    expect(extractDate(src("版本 1399"))).toBeNull();
    expect(extractDate(src("2026 规划"))).toBeNull();
    expect(extractDate(src("当前进展"))).toBeNull();
  });
  it("names kinds without number prefixes", () => {
    expect(kindName("05-进度与会议")).toBe("进度与会议");
    expect(kindName("需求")).toBe("需求");
    expect(kindName("5G 数据接入")).toBe("5G 数据接入");
  });
});

describe("timeline", () => {
  const n = (path: string, ctime = CT) => buildNote({ path, ctime, mtime: ctime, size: 1 }, folders);
  const notes = [
    n("10-工作/运维管家/05-进度与会议/进度情况/当前进展20240412.md"),
    n("10-工作/运维管家/05-进度与会议/进度情况/当前进展20240418.md"),
    n("10-工作/运维管家/05-进度与会议/进度情况/当前进展_0227.md"),
    n("10-工作/运维管家/05-进度与会议/进度情况/当前进展.md"),
    n("10-工作/5G 管家/02-需求/需求 2025-01-05.md"),
    n("10-工作/README.md"),
    n("20-个人/日记 2025-01-01.md")
  ];
  const t = buildTimeline(notes, "10-工作");
  it("puts MMDD notes in the folder's year and lists undated notes", () => {
    expect(t.items.map(i => [i.title, new Date(i.time).getFullYear(), i.lane, i.kind])).toEqual([
      ["当前进展_0227", 2024, "运维管家", "进度与会议"],
      ["当前进展20240412", 2024, "运维管家", "进度与会议"],
      ["当前进展20240418", 2024, "运维管家", "进度与会议"],
      ["需求 2025-01-05", 2025, "5G 管家", "需求"]
    ]);
    expect(t.undated).toEqual(["10-工作/运维管家/05-进度与会议/进度情况/当前进展.md"]);
    expect(t.lanes).toEqual(["5G 管家", "运维管家"]);
    expect(t.years).toEqual([2025, 2024]);
  });
  it("filters by lane and year", () => {
    expect(filterTimeline(t.items, "运维管家", 2025)).toEqual([]);
    expect(filterTimeline(t.items, "", 2025).length).toBe(1);
  });
});
