import { MarkdownView, Notice } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { moveRoam, nearestBlock, roamStep } from "./paragraph-roaming-core.js";
/* Reading view only. The blocks are collected from the rendered page, so it works on any note without source
   positions. Esc, a mode switch or a tab change ends it. */
const BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, pre, table, .callout-title";

function collect(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(BLOCKS)].filter(element => {
    if (element.closest(".ib-fold-toggle, .frontmatter, .ib-cover-block, .ib-cats-tail")) return false;
    if (element.matches("p") && element.closest("li")) return false;
    if (!element.matches("pre, table") && element.closest("pre, table")) return false;
    return element.getBoundingClientRect().height > 0 && Boolean(element.textContent?.trim() || element.matches("pre, table"));
  });
}

export function installParagraphRoaming(plugin: IgnorancePlugin) {
  let view: MarkdownView | null = null;
  let scroller: HTMLElement | null = null;
  let blocks: HTMLElement[] = [];
  let at = 0;
  let marked: HTMLElement | null = null;

  const clear = () => {
    marked?.classList.remove("ib-roam-current");
    marked = null;
    view = null;
    scroller = null;
    blocks = [];
  };
  const show = () => {
    marked?.classList.remove("ib-roam-current");
    marked = blocks[at] ?? null;
    if (!marked || !scroller) return;
    marked.classList.add("ib-roam-current");
    const box = marked.getBoundingClientRect();
    const frame = scroller.getBoundingClientRect();
    scroller.scrollBy({ top: box.top + box.height / 2 - (frame.top + frame.height / 2), behavior: "smooth" });
  };
  const toggle = () => {
    if (view) { clear(); return; }
    const active = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const host = active?.containerEl.querySelector<HTMLElement>(".markdown-reading-view .markdown-preview-view");
    if (!active || active.getMode() !== "preview" || !host) { new Notice(tr("请在阅读视图使用逐段阅读")); return; }
    const list = collect(host);
    if (!list.length) return;
    view = active;
    scroller = host;
    blocks = list;
    const frame = host.getBoundingClientRect();
    at = nearestBlock(list.map(block => block.getBoundingClientRect().bottom), frame.top + frame.height / 2);
    show();
  };

  plugin.addCommand({ id: "paragraph-roaming", name: tr("逐段阅读"), icon: "lucide-between-horizontal-start", callback: toggle });
  plugin.registerDomEvent(document, "keydown", event => {
    if (!view) return;
    if (event.key === "Escape") { clear(); return; }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable='true'], .modal-container") || view.getMode() !== "preview") return;
    const key = event.key.toLowerCase();
    const step = roamStep(event);
    if (!step || (key !== "j" && key !== "k")) return;
    event.preventDefault();
    event.stopPropagation();
    at = moveRoam(at, blocks.length, key === "j" ? 1 : -1, step);
    show();
  }, true);
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", clear));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", () => { if (view && view.getMode() !== "preview") clear(); }));
  plugin.register(clear);
}
