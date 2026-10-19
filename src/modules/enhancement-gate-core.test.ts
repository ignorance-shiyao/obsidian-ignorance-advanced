import { describe, expect, it } from "vitest";
import { ENHANCEMENTS, classNames, enhancementOffReason, noteOffClass, type EnhancementKind } from "./enhancement-gate-core";

describe("enhancement gate", () => {
  it("names one note class per kind", () => {
    expect(ENHANCEMENTS.map(item => noteOffClass(item.kind))).toEqual(["ib-no-tables", "ib-no-images", "ib-no-code", "ib-no-charts"]);
  });
  it("explains why a kind is off, in priority order", () => {
    const base: { settingOn: boolean; noteClasses: string[]; kind: EnhancementKind } = { settingOn: true, noteClasses: [], kind: "tables" };
    expect(enhancementOffReason(base)).toBeNull();
    expect(enhancementOffReason({ ...base, settingOn: false, noteClasses: ["ib-no-tables"] })).toBe("setting");
    expect(enhancementOffReason({ ...base, noteClasses: ["ib-no-tables"] })).toBe("note");
    expect(enhancementOffReason({ ...base, noteClasses: ["ib-no-code"] })).toBeNull();
    expect(enhancementOffReason({ ...base, handledByOther: true })).toBe("third-party");
  });
  it("reads cssclasses written as a list, a string or both properties", () => {
    expect(classNames({ cssclasses: ["a", "ib-no-code"] })).toEqual(["a", "ib-no-code"]);
    expect(classNames({ cssclasses: "a, b  c", cssclass: "d" })).toEqual(["a", "b", "c", "d"]);
    expect(classNames(null)).toEqual([]);
    expect(classNames({ cssclasses: 5 })).toEqual([]);
  });
});
