import { describe, expect, it } from "vitest";
import { createMermaidRenderQueue, mermaidRenderTargets, mermaidTargetPriority } from "./mermaid-render-queue.js";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const box = (top = 10, bottom = 60) => ({ top, bottom, left: 10, right: 110, width: 100, height: bottom - top });
function scene() {
  const body = {};
  const document = { body, querySelectorAll: () => [], defaultView: { innerHeight: 600, innerWidth: 800, getComputedStyle: node => node.style || {} } };
  const target = (rect = box(), style = {}, parentElement = body) => ({ isConnected: true, style, parentElement, getClientRects: () => [rect], getBoundingClientRect: () => rect });
  return { document, body, target };
}

describe("Mermaid visible rendering priority", () => {
  it("matches pending note blocks rather than the hidden scratch container", () => {
    const { document, body, target } = scene();
    const placeholder = target();
    document.querySelectorAll = () => [{ textContent: "flowchart LR\n A-->B\n", parentElement: placeholder }, { textContent: "pie", parentElement: target() }];
    const scratch = target(box(), { visibility: "hidden" }, body);
    expect([...mermaidRenderTargets(document, "flowchart LR\n A-->B", scratch)]).toEqual([placeholder]);
  });
  it("clips source blocks to their own note scroller", () => {
    const { document, target } = scene();
    const scroller = target(box(100, 400), { overflowY: "auto" });
    expect(mermaidTargetPriority(new Set([target(box(150, 200), {}, scroller)]), document)).toBe(0);
    expect(mermaidTargetPriority(new Set([target(box(450, 500), {}, scroller)]), document)).toBe(51);
    expect(mermaidTargetPriority(new Set([target(box(), {}, target(box(), { visibility: "hidden" }))]), document)).toBe(Infinity);
    const closed = target(); closed.isConnected = false;
    expect(mermaidTargetPriority(new Set([closed]), document)).toBe(Infinity);
  });
  it("rechecks priority after a jump and keeps only one render running", async () => {
    const positions = { first: 20, last: 80 };
    const order = []; let running = 0, peak = 0;
    let resume;
    const render = createMermaidRenderQueue(async (_, text) => { running++; peak = Math.max(peak, running); order.push(text); await tick(); running--; return { svg: text }; }, {
      targetsFor: text => new Set([text]), priorityFor: targets => positions[[...targets][0]], isDark: () => false,
      yieldToMain: () => new Promise(resolve => { resume = resolve; })
    });
    const first = render("a", "first"); const last = render("b", "last");
    positions.last = 0; resume(); await tick(); await tick(); resume();
    await tick(); resume(); await tick(); await tick(); resume();
    await Promise.all([first, last]);
    expect(order).toEqual(["last", "first"]); expect(peak).toBe(1);
  });
  it("lets the main thread run between drawing and SVG insertion", async () => {
    let resume, drawn = false, delivered = false;
    const render = createMermaidRenderQueue(async () => { drawn = true; return { svg: "finished" }; }, {
      targetsFor: () => new Set(), priorityFor: () => Infinity, isDark: () => false,
      yieldToMain: () => new Promise(resolve => { resume = resolve; })
    });
    const result = render("a", "source").then(value => { delivered = true; return value; });
    resume(); await tick();
    expect(drawn).toBe(true); expect(delivered).toBe(false);
    resume(); await expect(result).resolves.toEqual({ svg: "finished" });
  });
  it("shares duplicate drawings and promotes a visible duplicate target", async () => {
    const order = []; const priorities = new Map([["hidden", Infinity], ["visible", 0], ["near", 30]]);
    let calls = 0;
    const render = createMermaidRenderQueue(async (id, text) => { calls++; order.push(text); return { svg: `<svg id="${id}"><use href="#${id}"/></svg>` }; }, {
      targetsFor: (_, container) => new Set([container.target]), priorityFor: targets => Math.min(...[...targets].map(t => priorities.get(t))), isDark: () => false, yieldToMain: tick
    });
    const near = render("near", "near-source", { target: "near" });
    const hidden = render("original", "shared", { target: "hidden" });
    const visible = render("duplicate", "shared", { target: "visible" });
    const [a, b, c] = await Promise.all([near, hidden, visible]);
    expect(order).toEqual(["shared", "near-source"]); expect(calls).toBe(2);
    expect(b.svg).toContain('id="original"'); expect(c.svg).toContain('id="duplicate"'); expect(c.svg).not.toContain("original"); expect(a.svg).toContain("near");
  });
  it("continues after an invalid diagram and permits retrying that source", async () => {
    let failed = false;
    const render = createMermaidRenderQueue(async (_, text) => {
      if (text === "invalid" && !failed) { failed = true; throw new Error("parse failed"); }
      return { svg: text };
    }, { targetsFor: () => new Set(), priorityFor: () => Infinity, isDark: () => false, yieldToMain: tick });
    const bad = render("a", "invalid"); const good = render("b", "valid");
    await expect(bad).rejects.toThrow("parse failed"); await expect(good).resolves.toEqual({ svg: "valid" });
    await expect(render("c", "invalid")).resolves.toEqual({ svg: "invalid" });
  });
  it("keeps different width and theme renderings separate", async () => {
    let dark = false, calls = 0;
    const render = createMermaidRenderQueue(async id => { calls++; return { svg: id }; }, { targetsFor: () => new Set(), priorityFor: () => Infinity, isDark: () => dark, yieldToMain: tick });
    const a = render("a", "same", { style: { width: "400px" } });
    const b = render("b", "same", { style: { width: "800px" } });
    dark = true; const c = render("c", "same", { style: { width: "400px" } });
    await Promise.all([a, b, c]); expect(calls).toBe(3);
  });
});

describe("Mermaid 预渲染缓存", () => {
  it("后续请求复用 SVG 并换用新 id，主题改变后重新绘制", async () => {
    let calls = 0;
    const document = { body: { dataset: { ibThemeStamp: "azure-light" } } };
    const render = createMermaidRenderQueue(async id => { calls++; return { svg: `<svg id="${id}"><use href="#${id}-node"/></svg>` }; }, { document, targetsFor: () => new Set(), priorityFor: () => Infinity, isDark: () => false, yieldToMain: tick });
    await render("cached-id", "flowchart LR\nA-->B");
    const result = await render("visible-id", "flowchart LR\nA-->B");
    expect(calls).toBe(1);
    expect(result.svg).toContain('id="visible-id"');
    expect(result.svg).not.toContain("cached-id");
    document.body.dataset.ibThemeStamp = "teal-light";
    await render("new-theme-id", "flowchart LR\nA-->B");
    expect(calls).toBe(2);
  });
});
