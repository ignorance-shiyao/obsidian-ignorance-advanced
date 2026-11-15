import { describe, expect, it } from "vitest";
import { pickEngine, rememberEngine, rememberedEngine } from "./mermaid-engine-memory.js";

const engine = { render: () => Promise.resolve({ svg: "" }), initialize: () => {}, parse: () => true };

describe("mermaid engine memory", () => {
  it("keeps the engine across a plugin reload, out of sight of enumeration", () => {
    const host: Record<string, unknown> = {};
    expect(rememberedEngine(host)).toBeUndefined();
    rememberEngine(host, engine);
    expect(rememberedEngine(host)).toBe(engine);
    expect(Object.keys(host)).toEqual([]);
  });
  it("ignores values that are not an engine", () => {
    const host: Record<string, unknown> = {};
    rememberEngine(host, { render: 1 });
    expect(rememberedEngine(host)).toBeUndefined();
  });
});

describe("pickEngine", () => {
  const standIn = { render: () => ({ svg: "" }), initialize: () => {} };
  it("takes the engine loadMermaid() resolves with (Obsidian 1.15 returns it instead of assigning the global)", () => {
    expect(pickEngine(engine, standIn, undefined)).toBe(engine);
  });
  it("ignores the plugin's own stand-in and falls back to an engine seen before", () => {
    expect(pickEngine(standIn, standIn, engine)).toBe(engine);
    expect(pickEngine(undefined, standIn, undefined)).toBeUndefined();
  });
});
