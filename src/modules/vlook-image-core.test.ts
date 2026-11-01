import { describe, expect, it } from "vitest";
import { darkFileName, parseImageMagic } from "./vlook-image-core";

describe("VLOOK 图片魔法", () => {
  it("网格、留白、边框与明信片", () => {
    expect(parseImageMagic("a.svg#block#padding")).toMatchObject({ path: "a.svg", grid: "block", padding: true });
    expect(parseImageMagic("a.webp#cardd#border")).toMatchObject({ card: "tile", border: true });
    expect(parseImageMagic("a.webp#card")).toMatchObject({ card: "hover", border: false });
  });
  it("滤镜：aged 即复古，带 ! 悬停恢复", () => {
    expect(parseImageMagic("a.png#aged")).toMatchObject({ filter: "sepia", filterHover: false });
    expect(parseImageMagic("a.png#gray!")).toMatchObject({ filter: "gray", filterHover: true });
  });
  it("剪影与暗色", () => {
    expect(parseImageMagic("a.svg?fill=text")).toMatchObject({ fill: "text" });
    expect(parseImageMagic("a.svg?fill=Rd")).toMatchObject({ fill: "rd" });
    expect(parseImageMagic("a.svg?darksrc=invert")).toMatchObject({ dark: { invert: true } });
    expect(parseImageMagic("pic/a.png?darksrc=~#padding")).toMatchObject({ path: "pic/a.png", padding: true, dark: { file: "a~dark.png" } });
    expect(parseImageMagic("a.png?darksrc=b.png")).toMatchObject({ dark: { file: "b.png" } });
  });
  it("没有 VLOOK 写法时返回 null", () => {
    expect(parseImageMagic("a.png")).toBeNull();
    expect(parseImageMagic("a.png#heading")).toBeNull();
    expect(parseImageMagic("a.png?fill=xx")).toBeNull();
  });
  it("暗色文件名", () => {
    expect(darkFileName("x/y.z.png", "_")).toBe("y.z_dark.png");
    expect(darkFileName("noext", "-")).toBe("noext-dark");
  });
});
