import { describe, expect, it } from "vitest";
import { imageAlignment, imageLinkAt, withImageAlignment } from "./image-align-core";

const apply = (text, align) => withImageAlignment(imageLinkAt(text, 0), align);

describe("image alignment", () => {
  it("adds the keyword before the width in markdown links", () => {
    expect(apply("![说明|616](assets/a.webp)", "left")).toBe("![说明|left|616](assets/a.webp)");
    expect(apply("![](assets/a.webp)", "right")).toBe("![right](assets/a.webp)");
  });

  it("replaces an existing keyword and removes it for center", () => {
    expect(apply("![说明|left|616](a.webp)", "right")).toBe("![说明|right|616](a.webp)");
    expect(apply("![说明|left|616](a.webp)", "center")).toBe("![说明|616](a.webp)");
  });

  it("keeps the target of wikilinks", () => {
    expect(apply("![[a.webp|300]]", "left")).toBe("![[a.webp|left|300]]");
    expect(apply("![[a.webp|right]]", "center")).toBe("![[a.webp]]");
  });

  it("reads the current alignment, centered by default", () => {
    expect(imageAlignment(imageLinkAt("![说明|right|616](a.webp)", 0))).toBe("right");
    expect(imageAlignment(imageLinkAt("![[left.webp]]", 0))).toBe("center");
    expect(imageAlignment(imageLinkAt("![left](a.webp)", 0))).toBe("left");
  });

  it("finds a link only at the given offset", () => {
    expect(imageLinkAt("前文 ![a](b.png)", 3)?.to).toBe(14);
    expect(imageLinkAt("前文", 0)).toBeNull();
  });
});

describe("withoutImageWidth", () => {
  it("drops only the width", async () => {
    const { imageLinkAt, withoutImageWidth } = await import("./image-align-core.js");
    expect(withoutImageWidth(imageLinkAt("![说明|right|616](a.webp)", 0))).toBe("![说明|right](a.webp)");
    expect(withoutImageWidth(imageLinkAt("![[a.webp|left|300x200]]", 0))).toBe("![[a.webp|left]]");
    expect(withoutImageWidth(imageLinkAt("![图像](https://x/y.png)", 0))).toBe("![图像](https://x/y.png)");
  });
});

// Corner constraints and edge-only changes must survive link serialization.
import { resizedImageBox, withImageSize } from "./image-align-core";
describe("图片八方向缩放", () => {
  it("四角保持比例，四边只改变对应轴", () => {
    for (const direction of ["nw", "ne", "sw", "se"]) {
      const box = resizedImageBox(400, 200, 40, 20, direction);
      expect(box.width / box.height).toBeCloseTo(2);
    }
    expect(resizedImageBox(400, 200, 50, 80, "e")).toEqual({width:450,height:200});
    expect(resizedImageBox(400, 200, 50, 80, "n")).toEqual({width:400,height:120});
  });
  it("尺寸写回保留说明、对齐与地址且替换旧尺寸", () => {
    const link = imageLinkAt("![说明|right|300](assets/a.png)", 0);
    expect(withImageSize(link, 410, 180)).toBe("![说明|right|410x180](assets/a.png)");
  });
});
