import { describe, expect, it } from "vitest";
import { decode91, encode91 } from "./base91";

describe("base91", () => {
  it("round-trips arbitrary bytes", () => {
    for (const size of [0, 1, 2, 3, 13, 14, 255, 4096, 100001]) {
      const data = new Uint8Array(size).map((_, i) => (i * 131 + (i >> 3) * 17 + size) & 255);
      expect(Array.from(decode91(encode91(data)))).toEqual(Array.from(data));
    }
  });
  it("round-trips random bytes", () => {
    const data = new Uint8Array(50000); for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
    expect(Array.from(decode91(encode91(data)))).toEqual(Array.from(data));
  });
});
