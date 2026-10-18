import { afterEach, describe, expect, it, vi } from "vitest";
import { structureSlide } from "./structure";

interface NodeState { tag: string; height: number | null; children: HTMLElement[]; parent: HTMLElement | null; classes: Set<string>; attrs: Map<string, string> }
const nodes = new WeakMap<HTMLElement, NodeState>();
const state = (el: HTMLElement) => { const found = nodes.get(el); if (!found) throw Error("Missing test node"); return found; };
function element(tag: string, height: number | null = null, children: HTMLElement[] = []) {
  const el = {} as HTMLElement;
  const data: NodeState = { tag: tag.toUpperCase(), height, children: [], parent: null, classes: new Set(), attrs: new Map() };
  nodes.set(el, data);
  const append = (...items: HTMLElement[]) => { for (const item of items) { const old = state(item).parent; if (old) state(old).children = state(old).children.filter(child => child !== item); state(item).parent = el; data.children.push(item); } };
  const matches = (selector: string) => selector.split(",").some(part => part.trim().startsWith(".") ? data.classes.has(part.trim().slice(1)) : data.tag === part.trim().toUpperCase());
  const select = (selector: string): HTMLElement | null => {
    for (const part of selector.split(",")) {
      const steps = part.trim().replace(/^:scope\s*>\s*/, "").split(/\s*>\s*/);
      let candidates = data.children.filter(child => child.matches(steps[0]));
      for (const step of steps.slice(1)) candidates = candidates.flatMap(child => [...state(child).children]).filter(child => child.matches(step));
      if (candidates.length) return candidates[0];
    }
    return null;
  };
  Object.defineProperties(el, {
    tagName: { get: () => data.tag }, children: { get: () => data.children }, parentElement: { get: () => data.parent },
    className: { get: () => [...data.classes].join(" "), set: (value: string) => { data.classes = new Set(value.split(/\s+/).filter(Boolean)); } },
    classList: { value: { add: (...values: string[]) => values.forEach(value => data.classes.add(value)), contains: (value: string) => data.classes.has(value) } }
  });
  Object.assign(el, {
    append, appendChild: (child: HTMLElement) => { append(child); return child; }, matches, querySelector: select,
    getAttribute: (key: string) => data.attrs.get(key) ?? null, setAttribute: (key: string, value: string) => data.attrs.set(key, value),
    cloneNode: () => { const clone = element(data.tag, data.height); clone.className = el.className; state(clone).attrs = new Map(data.attrs); return clone; },
    after: (next: HTMLElement) => { const parent = data.parent; if (!parent) return; const index = state(parent).children.indexOf(el); state(next).parent = parent; state(parent).children.splice(index + 1, 0, next); },
    getBoundingClientRect: () => ({ height: data.height ?? data.children.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0) })
  });
  append(...children);
  return el;
}
function split(blocks: HTMLElement[]) {
  vi.stubGlobal("createDiv", (options?: { cls?: string }) => { const div = element("div"); div.className = options?.cls || ""; return div; });
  const body = element("div", null, blocks); body.className = "slide-body";
  const inner = element("div", null, [body]); inner.className = "slide-inner";
  structureSlide(element("section", null, [inner]), "split");
  return body;
}
afterEach(() => vi.unstubAllGlobals());
describe("分栏幻灯片", () => {
  it("四个等高块分成 2 + 2", () => { const body = split([10,10,10,10].map(h => element("p",h))); expect(state(body).children.map(c => c.children.length)).toEqual([2,2]); });
  it("首块特别高时分成 1 + 其余", () => { const body = split([100,10,10,10].map(h => element("p",h))); expect(state(body).children.map(c => c.children.length)).toEqual([1,3]); });
  it("六项无序列表拆成两个三项列表", () => { const body = split([element("ul",null,Array.from({length:6},()=>element("li",10)))]); expect(state(body).children.map(c => c.children[0].children.length)).toEqual([3,3]); expect(state(body).children.map(c=>c.children[0].tagName)).toEqual(["UL","UL"]); });
  it("有序列表从 3 开始，第二栏从 5 续号", () => { const list=element("ol",null,Array.from({length:4},()=>element("li",10))); list.setAttribute("start","3"); const body=split([list]); expect(state(body).children.map(c=>c.children[0].getAttribute("start"))).toEqual(["3","5"]); });
  it("已有显式分栏时不再处理", () => { const cols=element("div",10);cols.className="ibc-container--cols";const blocks=[cols,element("p",10)];expect(state(split(blocks)).children).toEqual(blocks); });
  it("只有一个普通块时不分栏", () => { const only=element("p",20);expect(state(split([only])).children).toEqual([only]); });
  it("未挂载导致高度为零时按块数平分", () => { const body=split(Array.from({length:5},()=>element("p",0)));expect(state(body).children.map(c=>c.children.length)).toEqual([3,2]); });
});
