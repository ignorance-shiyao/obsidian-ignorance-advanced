import { describe, expect, it } from "vitest";
import { parseScripts } from "./prose-extras-core.js";

describe("parseScripts", () => {
  it("finds sub and sup", () => {
    expect(parseScripts("H~2~O 与 x^2^")).toEqual([
      { kind: "sub", text: "2", start: 1, end: 4 },
      { kind: "sup", text: "2", start: 9, end: 12 }
    ]);
  });
  it("leaves strike, colour codes and markers alone", () => {
    expect(parseScripts("~~删~~ 文字_~Rd~_ _^tab^_")).toEqual([]);
  });
  it("needs no edge spaces", () => {
    expect(parseScripts("a ~ b ~ c")).toEqual([]);
    expect(parseScripts("约 ~10~ 分钟")).toHaveLength(1);
  });
});
