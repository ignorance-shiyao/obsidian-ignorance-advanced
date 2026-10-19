import { describe, expect, it } from "vitest";
import { copyName, extensionFor, findImageRefs, formatBytes, outputType, rewriteRefs, targetSize } from "./image-batch-core";

describe("image batch", () => {
  const note = "![[a.png|300]]\n![x](folder/b%20c.jpg \"t\")\n![y](<d e.webp>)\n![g](anim.gif)\n![r](https://x.com/z.png)\n`![[code.png]]`\n```\n![[fence.png]]\n```\n![[a.png]]";
  it("finds local images outside code and skips gif, svg and urls", () => {
    expect(findImageRefs(note).map(ref => [ref.kind, ref.target])).toEqual([["wiki", "a.png"], ["markdown", "folder/b c.jpg"], ["markdown", "d e.webp"], ["wiki", "a.png"]]);
  });
  it("computes a fitted size without enlarging", () => {
    expect(targetSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(targetSize(800, 600, 1600)).toBeNull();
    expect(targetSize(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
    expect(targetSize(100, 100, 0)).toBeNull();
  });
  it("never turns transparent images into JPEG", () => {
    expect(outputType("image/png", true, "keep")).toBe("image/png");
    expect(outputType("image/png", false, "keep")).toBe("image/jpeg");
    expect(outputType("image/jpeg", false, "keep")).toBe("image/jpeg");
    expect(outputType("image/png", true, "webp")).toBe("image/webp");
    expect(extensionFor("image/jpeg")).toBe("jpg");
  });
  it("picks a free copy name", () => {
    const taken = new Set(["a-min.jpg", "a-min 2.jpg"]);
    expect(copyName("a.png", "jpg", name => taken.has(name))).toBe("a-min 3.jpg");
    expect(copyName("dir/b.png", "png", () => false)).toBe("dir/b-min.png");
  });
  it("rewrites only the targets that have a replacement, keeping sizes and titles", () => {
    const refs = findImageRefs(note);
    const out = rewriteRefs(note, refs, new Map([["a.png", "a-min.jpg"], ["d e.webp", "d e-min.webp"]]));
    expect(out).toContain("![[a-min.jpg|300]]");
    expect(out).toContain("![y](<d e-min.webp>)");
    expect(out).toContain("![x](folder/b%20c.jpg \"t\")");
    expect(out.match(/a-min\.jpg/g)).toHaveLength(2);
    expect(out).toContain("`![[code.png]]`");
    expect(out).toContain("![[fence.png]]");
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1048576)).toBe("3.00 MB");
  });
});
