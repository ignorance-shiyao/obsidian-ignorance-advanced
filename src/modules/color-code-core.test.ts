import { describe, expect, it } from "vitest";
import { colorLabel, colorVar, gradient, parseColorCode } from "./color-code-core";

describe("VLOOK 色号", () => {
  it("单色、强调与渐变", () => {
    expect(parseColorCode("~Rd~")).toEqual({ colors: ["rd"], emphasis: false });
    expect(parseColorCode("~Bu!~")).toEqual({ colors: ["bu"], emphasis: true });
    expect(parseColorCode("~RdSe~")).toEqual({ colors: ["rd", "se"], emphasis: false });
    expect(parseColorCode("~T1T2!~")).toEqual({ colors: ["t1", "t2"], emphasis: true });
  });
  it("不是色号的写法不识别", () => {
    for (const text of ["Rd", "~Rx~", "~R~", "~~Rd~~", "~Rd !~", "~rd gn~"]) expect(parseColorCode(text)).toBeNull();
  });
  it("太亮的颜色用于文字时换成加深色", () => {
    expect(colorVar("ye", "text")).toBe("var(--ib-ac-ye-text)");
    expect(colorVar("rd", "text")).toBe("var(--ib-ac-rd)");
    expect(colorVar("bu", "fade")).toBe("var(--ib-ac-bu-fade)");
  });
  it("渐变与标签", () => {
    expect(gradient(["rd", "gn"], 90)).toBe("linear-gradient(90deg, var(--ib-ac-rd), var(--ib-ac-gn))");
    expect(colorLabel(["bk", "rd", "gn"])).toBe("BkRdGn");
  });
});
