import type { View, WorkspaceLeaf } from "obsidian";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { ItemView, MarkdownView } from "obsidian";
/* The same jump list as the navigation command, kept open in a sidebar: it follows the note you are reading,
   filters as you type, and jumps on click. */
import { buildNavItems, NAV_ICONS } from "./navigation.js";
import type { NavItem } from "./navigation.js";

export const NAVIGATION_VIEW = "ignorance-navigation";

export function createNavigationView(_plugin: IgnorancePlugin) {

  return class NavigationView extends ItemView {
    target: View | null;
    timer: number;
    query: string;
    listEl: HTMLElement | null = null;
    items: NavItem[] = [];

    constructor(leaf: WorkspaceLeaf) { super(leaf); this.target = null; this.timer = 0; this.query = ""; }
    getViewType() { return NAVIGATION_VIEW; }
    getDisplayText() { return tr("导航"); }
    getIcon() { return "lucide-list-tree"; }

    async onOpen() {
      this.contentEl.empty();
      this.contentEl.addClass("ib-nav-view");
      const bar = this.contentEl.createDiv({ cls: "ib-nav-view__bar" });
      const input = bar.createEl("input", { cls: "ib-nav-view__search", attr: { type: "search", placeholder: tr("搜索标题、图表、表格、代码…"), spellcheck: "false" } });
      input.addEventListener("input", () => { this.query = input.value.trim().toLowerCase(); this.paint(); });
      this.listEl = this.contentEl.createDiv({ cls: "ib-nav-view__list", attr: { role: "list", "aria-label": tr("笔记结构") } });
      // Keyboard: ↓ from the search box enters the list, Enter there opens the first match; in the list ↑/↓/Home/End
      // move and Enter or Space jumps. ↑ on the first row goes back to the search box.
      const rows = () => [...this.listEl.querySelectorAll<HTMLElement>(".ib-nav-view__row")];
      input.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") { event.preventDefault(); rows()[0]?.focus(); }
        else if (event.key === "Enter") { event.preventDefault(); rows()[0]?.click(); }
      });
      this.listEl.addEventListener("keydown", event => {
        const list = rows(), index = list.indexOf(event.target as HTMLElement);
        if (index < 0) return;
        const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key];
        if (move !== undefined) {
          event.preventDefault();
          if (move < 0) input.focus(); else list[Math.min(move, list.length - 1)].focus();
        } else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); list[index].click(); }
      });
      const schedule = () => { window.clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.refresh(), 400); };
      this.registerEvent(this.app.workspace.on("active-leaf-change", leaf => {
        if (leaf?.view instanceof MarkdownView) { this.target = leaf.view; schedule(); }
      }));
      this.registerEvent(this.app.workspace.on("editor-change", schedule));
      this.registerEvent(this.app.metadataCache.on("changed", schedule));
      this.register(() => window.clearTimeout(this.timer));
      this.target = this.app.workspace.getActiveViewOfType(MarkdownView) || this.app.workspace.getMostRecentLeaf()?.view || null;
      if (!(this.target instanceof MarkdownView)) this.target = this.app.workspace.getLeavesOfType("markdown")[0]?.view || null;
      await this.refresh();
    }

    async refresh() {
      const view = this.target;
      if (!(view instanceof MarkdownView) || !view.file) { this.items = []; this.paint(); return; }
      const cache = this.app.metadataCache.getFileCache(view.file) || {};
      const headings = (cache.headings || []).map(item => ({ text: item.heading, level: item.level, line: item.position.start.line }));
      const source = view.getMode?.() === "source" && view.editor ? view.editor.getValue() : await this.app.vault.cachedRead(view.file);
      this.items = buildNavItems(source, headings);
      this.paint();
    }

    paint() {
      if (!this.listEl) return;
      this.listEl.empty();
      const items = (this.items || []).filter(item => !this.query || item.label.toLowerCase().includes(this.query));
      if (!items.length) {
        this.listEl.createDiv({ cls: "ib-nav-view__empty", text: this.target ? tr("没有可跳转的内容") : tr("打开一篇笔记后显示它的结构") });
        return;
      }
      for (const item of items) {
        const row = this.listEl.createDiv({ cls: `ib-nav-view__row ib-nav-view__row--${item.kind}`, attr: { role: "listitem", tabindex: "0" } });
        row.style.setProperty("--ib-nav-indent", `${Math.max(0, (item.level || 1) - 1) * 0.9}em`);
        row.createSpan({ cls: "ib-nav-view__icon", text: NAV_ICONS[item.kind] });
        row.createSpan({ cls: "ib-nav-view__label", text: item.label });
        row.addEventListener("click", () => {
          const view = this.target;
          if (!view) return;
          this.app.workspace.setActiveLeaf(view.leaf, { focus: true });
          view.setEphemeralState({ line: item.line });
        });
      }
    }
  };
}

export async function openNavigationView(plugin: IgnorancePlugin) {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(NAVIGATION_VIEW)[0];
  if (!leaf) {
    leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: NAVIGATION_VIEW, active: true });
  }
  void workspace.revealLeaf(leaf);
}
