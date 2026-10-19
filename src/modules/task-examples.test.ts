import { describe, expect, it } from "vitest";
import { TASK_EXAMPLES } from "./task-examples";
import { parseCaptions } from "./captions";

describe("task examples", () => {
  it("has four distinct, non-empty examples", () => {
    expect(TASK_EXAMPLES).toHaveLength(4);
    expect(new Set(TASK_EXAMPLES.map(item => item.title)).size).toBe(4);
    expect(TASK_EXAMPLES.every(item => item.body.startsWith("---") || item.body.startsWith("#"))).toBe(true);
  });
  it("only references caption ids that exist", () => {
    for (const example of TASK_EXAMPLES) {
      const ids = new Set(parseCaptions(example.body).map(caption => caption.id));
      for (const match of example.body.matchAll(/\(\(ref:([\w-]+)\)\)/g)) expect(ids.has(match[1])).toBe(true);
    }
  });
  it("has an English version with the same structure", () => {
    for (const example of TASK_EXAMPLES) {
      expect(example.en.title).toBeTruthy();
      const ids = new Set(parseCaptions(example.en.body).map(caption => caption.id));
      for (const match of example.en.body.matchAll(/\(\(ref:([\w-]+)\)\)/g)) expect(ids.has(match[1])).toBe(true);
      expect(example.en.body.match(/^---$/gm)?.length).toBe(example.body.match(/^---$/gm)?.length);
    }
  });
});
