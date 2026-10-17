import type { MenuItem, TFile, TFolder, WorkspaceLeaf } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Menu, Platform, setTooltip } from "obsidian";
import { setIcon } from "./ui-icons.js";
/* The note header shows the folder path (Obsidian's breadcrumb) only when the
   whole "folder / … / name" fits; otherwise just the file name. Each tab is
   measured on its own and again whenever its header changes width.
   The folder button overrides that for the current note (desktop), or opens
   the path as a small tree (mobile) — each folder from the vault root down,
   and picking one reveals it in the file explorer.
   Hiding the breadcrumb itself is the theme's job (.ib-path-shown). */

const BUTTON = "ib-path-toggle";
const SHOWN = "ib-path-shown";
const observed = new WeakMap<Element, ResizeObserver>();

// The view of a note tab: the published View type does not list its file.
interface NoteView { containerEl: HTMLElement; file?: TFile | null }
// The file explorer view can scroll a folder into sight.
interface ExplorerView { revealInFolder?(folder: TFolder): void }
// Per tab, the path state the user chose by hand with the folder button.
const overrides = new WeakMap<WorkspaceLeaf, { path: string; shown: boolean }>();

// Show the path when it fits, unless the user toggled this note by hand.
function fit(leaf: WorkspaceLeaf) {
  const view = leaf.view as NoteView;
  const root = view?.containerEl;
  const container = root?.querySelector(".view-header-title-container");
  const file = view?.file;
  if (!container || !file) return;
  const override = overrides.get(leaf);
  if (override && override.path === file.path) {
    root.toggleClass(SHOWN, override.shown);
    return;
  }
  overrides.delete(leaf);
  if (!ancestors(file).length) { root.removeClass(SHOWN); return; }
  root.addClass(SHOWN);
  // Measure with the path laid out; the title area clips what does not fit.
  const fits = container.scrollWidth <= container.clientWidth + 1;
  if (!fits) root.removeClass(SHOWN);
}

function ancestors(file: TFile) {
  const chain: TFolder[] = [];
  for (let folder = file?.parent; folder && !folder.isRoot(); folder = folder.parent) chain.unshift(folder);
  return chain;
}

async function revealFolder(plugin: IgnorancePlugin, folder: TFolder) {
  const { workspace } = plugin.app;
  const leaf = workspace.getLeavesOfType("file-explorer")[0];
  if (!leaf) return;
  await workspace.revealLeaf?.(leaf);
  (leaf.view as ExplorerView)?.revealInFolder?.(folder);
}

function showTree(plugin: IgnorancePlugin, file: TFile, event: MouseEvent) {
  const menu = new Menu();
  const chain = ancestors(file);
  // Indent whole rows (icon included) so the path reads as a tree.
  const indent = (item: MenuItem, depth: number) => {
    const dom = (item as MenuItem & { dom?: HTMLElement }).dom;
    if (dom) dom.style.paddingInlineStart = `calc(var(--size-4-2) + ${depth * 16}px)`;
  };
  chain.forEach((folder, depth) => {
    menu.addItem(item => {
      item.setTitle(folder.name).setIcon(depth === chain.length - 1 ? "lucide-folder-open" : "lucide-folder")
        .onClick(() => { void revealFolder(plugin, folder); });
      indent(item, depth);
    });
  });
  menu.addItem(item => {
    item.setTitle(file.basename).setIcon("lucide-file-text").setChecked(true).onClick(() => { /* the current note: nothing to reveal */ });
    indent(item, chain.length);
  });
  menu.showAtMouseEvent(event);
}

function decorate(plugin: IgnorancePlugin, leaf: WorkspaceLeaf) {
  const view = leaf.view as NoteView;
  const container = view?.containerEl?.querySelector<HTMLElement>(".view-header-title-container");
  if (!container) return;
  let button = container.querySelector<HTMLElement>(`:scope > .${BUTTON}`);
  const file = view.file;
  const hasPath = Boolean(file && ancestors(file).length);
  if (!hasPath) { button?.remove(); return; }
  if (!button) {
    button = createDiv({ cls: `${BUTTON} clickable-icon` });
    setIcon(button, "lucide-folder-tree");
    container.prepend(button);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const current = (leaf.view as NoteView)?.file;
      if (!current) return;
      if (Platform.isMobile) { showTree(plugin, current, event); return; }
      const shown = !view.containerEl.hasClass(SHOWN);
      overrides.set(leaf, { path: current.path, shown });
      view.containerEl.toggleClass(SHOWN, shown);
      setTooltip(button, tooltip(leaf, current), { placement: "bottom" });
    });
  }
  if (!observed.has(container)) {
    // Re-fit when the header changes width (window, split, sidebars).
    let lastWidth = 0;
    const observer = new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;
      window.requestAnimationFrame(() => fit(leaf));
    });
    observer.observe(container.parentElement || container);
    observed.set(container, observer);
    plugin.register(() => observer.disconnect());
  }
  fit(leaf);
  setTooltip(button, tooltip(leaf, file), { placement: "bottom" });
}

function tooltip(leaf: WorkspaceLeaf, file: TFile) {
  if (Platform.isMobile) return "所在目录";
  return leaf.view?.containerEl?.hasClass(SHOWN) ? "收起路径" : `展开路径：${file.parent.path}`;
}

export function installHeaderPath(plugin: IgnorancePlugin) {
  const sweep = () => plugin.app.workspace.iterateAllLeaves(leaf => decorate(plugin, leaf));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", sweep));
  plugin.registerEvent(plugin.app.workspace.on("file-open", () => window.setTimeout(sweep, 0)));
  plugin.registerEvent(plugin.app.vault.on("rename", () => window.setTimeout(sweep, 0)));
  plugin.app.workspace.onLayoutReady(sweep);
  plugin.register(() => {
    document.querySelectorAll(`.${SHOWN}`).forEach(el => el.removeClass(SHOWN));
    document.querySelectorAll(`.${BUTTON}`).forEach(el => el.remove());
  });
}
