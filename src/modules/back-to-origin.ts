import { MarkdownView, setIcon, type WorkspaceLeaf } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
/* After jumping within the same note (heading link, block link, footnote), a small "Back" button returns
   the reader to where they were. It disappears once used, after the note changes, or after a while. */
const HIDE_AFTER = 30_000;

/** True when a link points inside the note that is open, rather than to another file. */
export function isSameNoteLink(href: string, currentBasename: string): boolean {
  const value = decodeURIComponent(String(href || "")).trim();
  if (!value) return false;
  if (value.startsWith("#")) return true;
  const hash = value.indexOf("#");
  if (hash < 0) return false;
  const target = value.slice(0, hash).replace(/\.md$/i, "");
  return target === "" || target === currentBasename || target.endsWith(`/${currentBasename}`);
}

export function installBackToOrigin(plugin: IgnorancePlugin) {
  let button: HTMLButtonElement | null = null;
  let timer = 0;
  const hide = () => { window.clearTimeout(timer); button?.remove(); button = null; };
  const show = (leaf: WorkspaceLeaf, view: MarkdownView, scroll: number) => {
    hide();
    const host = view.containerEl.querySelector<HTMLElement>(".view-content");
    if (!host) return;
    button = host.createEl("button", { cls: "ib-back-origin", attr: { type: "button", "aria-label": tr("返回原处") } });
    setIcon(button, "undo-2");
    button.addEventListener("click", () => {
      if (leaf.view === view) view.currentMode.applyScroll(scroll);
      hide();
    });
    timer = window.setTimeout(hide, HIDE_AFTER);
  };
  plugin.registerDomEvent(document, "click", event => {
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest<HTMLAnchorElement>("a.internal-link, a.footnote-link, sup a[href^='#'], a.footnote-backref");
    if (!link || !link.closest(".markdown-reading-view, .markdown-source-view")) return;
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file || !view.containerEl.contains(link)) return;
    const href = link.getAttribute("data-href") || link.getAttribute("href") || "";
    if (!isSameNoteLink(href, file.basename)) return;
    const scroll = view.currentMode.getScroll();
    const leaf = view.leaf;
    window.setTimeout(() => {
      if (Math.abs(view.currentMode.getScroll() - scroll) > 2) show(leaf, view, scroll);
    }, 400);
  }, true);
  plugin.registerEvent(plugin.app.workspace.on("file-open", hide));
  plugin.register(hide);
}
