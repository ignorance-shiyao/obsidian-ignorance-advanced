import { setIcon } from "./ui-icons.js";
/* The note header shows the folder path (Obsidian's breadcrumb) only when the
   whole "folder / … / name" fits; otherwise just the file name. Each tab is
   measured on its own and again whenever its header changes width.
   The folder button overrides that for the current note (desktop), or opens
   the path as a small tree (mobile) — each folder from the vault root down,
   and picking one reveals it in the file explorer.
   Hiding the breadcrumb itself is the theme's job (.ib-path-shown). */
const { Menu, Platform, setTooltip } = require("obsidian");

const BUTTON = "ib-path-toggle";
const SHOWN = "ib-path-shown";
const observed = new WeakMap();

// Show the path when it fits, unless the user toggled this note by hand.
function fit(leaf) {
  const view = leaf.view;
  const root = view?.containerEl;
  const container = root?.querySelector(".view-header-title-container");
  const file = view?.file;
  if (!container || !file) return;
  const override = leaf._ibPathOverride;
  if (override && override.path === file.path) {
    root.toggleClass(SHOWN, override.shown);
    return;
  }
  delete leaf._ibPathOverride;
  if (!ancestors(file).length) { root.removeClass(SHOWN); return; }
  root.addClass(SHOWN);
  // Measure with the path laid out; the title area clips what does not fit.
  const fits = container.scrollWidth <= container.clientWidth + 1;
  if (!fits) root.removeClass(SHOWN);
}

function ancestors(file) {
  const chain = [];
  for (let folder = file?.parent; folder && !folder.isRoot(); folder = folder.parent) chain.unshift(folder);
  return chain;
}

async function revealFolder(plugin, folder) {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType("file-explorer")[0];
  if (!leaf) return;
  await workspace.revealLeaf?.(leaf);
  leaf.view?.revealInFolder?.(folder);
}

function showTree(plugin, file, event) {
  const menu = new Menu();
  const chain = ancestors(file);
  // Indent whole rows (icon included) so the path reads as a tree.
  const indent = (item, depth) => { if (item.dom) item.dom.style.paddingInlineStart = `calc(var(--size-4-2) + ${depth * 16}px)`; };
  chain.forEach((folder, depth) => {
    menu.addItem(item => {
      item.setTitle(folder.name).setIcon(depth === chain.length - 1 ? "lucide-folder-open" : "lucide-folder")
        .onClick(() => revealFolder(plugin, folder));
      indent(item, depth);
    });
  });
  menu.addItem(item => {
    item.setTitle(file.basename).setIcon("lucide-file-text").setChecked(true).onClick(() => {});
    indent(item, chain.length);
  });
  menu.showAtMouseEvent(event);
}

function decorate(plugin, leaf) {
  const view = leaf.view;
  const container = view?.containerEl?.querySelector(".view-header-title-container");
  if (!container) return;
  let button = container.querySelector(`:scope > .${BUTTON}`);
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
      const current = leaf.view?.file;
      if (!current) return;
      if (Platform.isMobile) { showTree(plugin, current, event); return; }
      const shown = !view.containerEl.hasClass(SHOWN);
      leaf._ibPathOverride = { path: current.path, shown };
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

function tooltip(leaf, file) {
  if (Platform.isMobile) return "所在目录";
  return leaf.view?.containerEl?.hasClass(SHOWN) ? "收起路径" : `展开路径：${file.parent.path}`;
}

export function installHeaderPath(plugin) {
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
