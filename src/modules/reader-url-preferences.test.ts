import { describe, expect, it } from "vitest";
import { Platform } from "obsidian";
import { readerUrlPreferencesScript, readerEarlyScript, readerAnchorRestoreScript } from "./reader-url-preferences";
const vm = Platform.isDesktop ? await import("node:vm") : null;
interface UrlStore { get(key: string): string | null; set(key: string, value: string): void; anchor(): string; setAnchor(id: string): void }
function open(url: string, preview = false, failHistory = false) {
  const location = new URL(url);
  const frame: { top?: object } = {}; frame.top = preview ? {} : frame;
  let replacements = 0;
  const context = { location, window: frame, URLSearchParams,
    history: { state: { reader: true }, replaceState: (_state: object, _title: string, href: string) => { if (failHistory) throw Error("disabled"); replacements++; location.href = href; } },
    get localStorage() { throw Error("browser storage must never be accessed"); },
    get sessionStorage() { throw Error("browser storage must never be accessed"); }
  };
  const store = vm.runInNewContext(readerUrlPreferencesScript(), context) as UrlStore;
  return { store, location, replacements: () => replacements };
}
describe("网址片段阅读偏好", () => {
  it("刷新后恢复明暗和四种宽度，保留原网址查询，不访问浏览器存储", () => {
    for (const width of ["narrow", "standard", "wide", "full"]) {
      const page = open("file:///notes/article.html?download=1");
      page.store.set("theme", "dark"); page.store.set("width", width);
      const refreshed = open(page.location.href);
      expect(refreshed.store.get("theme")).toBe("dark");
      expect(refreshed.store.get("width")).toBe(width);
      expect(page.location.search).toBe("?download=1");
      expect(page.replacements()).toBe(2);
    }
  });
  it("原章节链接与 Unicode 标识在设置变化后仍保留，改变章节不丢偏好", () => {
    const page = open("https://example.test/article#%E7%AC%AC%E4%B8%80%E7%AB%A0");
    expect(page.store.anchor()).toBe("第一章");
    page.store.set("theme", "light"); page.store.set("width", "wide");
    expect(page.store.anchor()).toBe("第一章");
    page.store.setAnchor("节 & 2/附录");
    const refreshed = open(page.location.href);
    expect(refreshed.store.anchor()).toBe("节 & 2/附录");
    expect(refreshed.store.get("theme")).toBe("light");
    expect(refreshed.store.get("width")).toBe("wide");
  });
  it("忽略无效值并响应外部片段变化，不把未支持的选项持久化", () => {
    const page = open("file:///reader.html#ib-reader?theme=invalid&width=bad");
    expect(page.store.get("theme")).toBeNull(); expect(page.store.get("width")).toBeNull();
    page.location.hash = "ib-reader?theme=dark&width=narrow";
    expect(page.store.get("theme")).toBe("dark"); expect(page.store.get("width")).toBe("narrow");
    page.store.set("font", "serif"); expect(page.store.get("font")).toBe("serif");
    expect(page.location.hash).not.toContain("font");
    expect(open(page.location.href).store.get("font")).toBeNull();
  });
  it("嵌入预览不修改宿主网址，仍能在当前页面切换", () => {
    const page = open("about:srcdoc", true);
    page.store.set("theme", "dark"); page.store.set("width", "full"); page.store.setAnchor("chapter");
    expect(page.location.href).toBe("about:srcdoc"); expect(page.replacements()).toBe(0);
    expect(page.store.get("theme")).toBe("dark"); expect(page.store.get("width")).toBe("full");
  });
  it("受限的历史接口回退到片段，不影响刷新恢复", () => {
    const page = open("file:///reader.html", false, true);
    page.store.set("theme", "dark");
    expect(open(page.location.href).store.get("theme")).toBe("dark");
  });
});


describe("阅读器首次绘制与章节恢复时序", () => {
  it("首屏脚本在正文绘制前读取深色和禁用原生滚动恢复", () => {
    const shell = { dataset: { theme: "light" } }, root = { dataset: { ibTheme: "light" } };
    const frame: { top?: object } = {}; frame.top = frame;
    const history = { scrollRestoration: "auto" };
    vm.runInNewContext(readerEarlyScript(), { window: frame, history, URLSearchParams, location: new URL("https://example.test/reader#ib-reader?theme=dark&anchor=section-2"), document: { currentScript: { parentElement: shell }, documentElement: root } });
    expect(shell.dataset.theme).toBe("dark"); expect(root.dataset.ibTheme).toBe("dark"); expect(history.scrollRestoration).toBe("manual");
  });
  it("头部脚本在样式表与正文出现前设置根主题", () => {
    const root = { dataset: { ibTheme: "light" } }, frame: { top?: object } = {}; frame.top = frame;
    vm.runInNewContext(readerEarlyScript(true), { window: frame, URLSearchParams, history: {}, location: new URL("https://example.test/reader#ib-reader?theme=dark"), document: { documentElement: root } });
    expect(root.dataset.ibTheme).toBe("dark");
  });
  function harness() {
    const frames: Array<() => void> = [], events = new Map<string, () => void>();
    let y = 0;
    const context = { store: { anchor: () => "section-2" }, history: { scrollRestoration: "auto" }, document: { readyState: "loading", getElementById: () => ({ scrollIntoView: () => { y = 1400; } }) }, requestAnimationFrame: (callback: () => void) => frames.push(callback), addEventListener: (name: string, callback: () => void) => events.set(name, callback), measure: () => {}, update: () => {} };
    vm.runInNewContext(`let restoringAnchor=true;${readerAnchorRestoreScript()}`, context);
    return { frames: () => { while (frames.length) frames.shift()?.(); }, event: (name: string) => events.get(name)?.(), reset: (value: number) => { y = value; }, y: () => y, history: context.history };
  }
  it("首帧之后浏览器回到顶部，load 后仍重新定位章节", () => {
    const page = harness(); page.frames(); expect(page.y()).toBe(1400);
    page.reset(0); page.event("load"); page.frames();
    expect(page.y()).toBe(1400); expect(page.history.scrollRestoration).toBe("manual");
  });
  it("用户主动滚动时取消尚未完成的恢复，不在 load 后抢回位置", () => {
    const page = harness(); page.frames(); page.event("wheel"); page.reset(900); page.event("load"); page.frames(); expect(page.y()).toBe(900);
  });
});
