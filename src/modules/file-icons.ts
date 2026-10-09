// File-type icons in the file explorer, from the same Material Icon Theme set as the language
// icons. The theme's Lucide masks stay as the fallback until the icon file has loaded.
import { iconMarkup, loadPack, type IconPack } from "./icon-library.js";

const FILE = "file-icons.json";

export function fileIconName(pack: IconPack, path: string): string | null {
  const base = path.split("/").pop()!.toLowerCase();
  if (pack.names[base]) return pack.names[base];
  // "a.test.ts" tries "test.ts", then "ts".
  const parts = base.split(".");
  for (let i = 1; i < parts.length; i++) {
    const hit = pack.ext[parts.slice(i).join(".")];
    if (hit) return hit;
  }
  return pack.file || null;
}

export function installFileIcons(plugin) {
  let pack: IconPack | null = null, loading = false, frame = 0;
  const pending = new Set<Element>();

  const decorateFolder = (title: Element) => {
    const path = title.getAttribute("data-path");
    if (!pack || !path) return;
    const closed = iconMarkup(pack, pack.folder), open = iconMarkup(pack, pack.folderOpen);
    let holder = title.querySelector<HTMLElement>(":scope > .ib-file-icon");
    if (!closed || !open) { holder?.remove(); return; }
    if (!holder) {
      holder = document.createElement("span");
      holder.className = "ib-file-icon is-folder";
      holder.setAttribute("aria-hidden", "true");
      title.insertBefore(holder, title.querySelector(":scope > .nav-folder-title-content") || title.firstChild);
    }
    if (holder.dataset.path !== path) {
      holder.dataset.path = path;
      holder.innerHTML = `<span class="ib-fo-closed">${closed}</span><span class="ib-fo-open">${open}</span>`;
    }
    setEmpty(holder, path);
  };

  // An empty folder gets its own ghosted look, whether it is open or closed.
  const setEmpty = (holder: HTMLElement, path: string) => {
    const folder: any = plugin.app.vault.getAbstractFileByPath(path);
    holder.classList.toggle("is-empty", Array.isArray(folder?.children) && folder.children.length === 0);
  };
  const refreshFolders = () => document.querySelectorAll<HTMLElement>(".nav-folder-title[data-path] > .ib-file-icon").forEach(holder => setEmpty(holder, holder.dataset.path!));

  const decorate = (title: Element) => {
    if (title.matches(".nav-folder-title")) return decorateFolder(title);
    const path = title.getAttribute("data-path");
    if (!pack || !path) return;
    const markup = iconMarkup(pack, fileIconName(pack, path));
    let holder = title.querySelector<HTMLElement>(":scope > .ib-file-icon");
    if (!markup) { holder?.remove(); return; }
    if (!holder) {
      holder = document.createElement("span");
      holder.className = "ib-file-icon";
      holder.setAttribute("aria-hidden", "true");
      title.insertBefore(holder, title.querySelector(":scope > .nav-file-title-content") || title.firstChild);
    }
    if (holder.dataset.path !== path) { holder.dataset.path = path; holder.innerHTML = markup; }
  };

  const flush = () => {
    frame = 0;
    if (!pack) {
      if (loading) return;
      loading = true;
      loadPack(plugin, FILE).then(loaded => { pack = loaded; document.querySelectorAll(".nav-file-title[data-path], .nav-folder-title[data-path]").forEach(decorate); }).catch(() => { loading = false; });
      return;
    }
    pending.forEach(decorate);
    pending.clear();
  };
  const schedule = () => { if (!frame) frame = window.requestAnimationFrame(flush); };

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") { if ((mutation.target as Element).matches?.(".nav-file-title, .nav-folder-title")) pending.add(mutation.target as Element); continue; }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(".nav-file-title, .nav-folder-title")) pending.add(node);
        node.querySelectorAll?.(".nav-file-title[data-path], .nav-folder-title[data-path]").forEach(title => pending.add(title));
      }
    }
    if (pending.size || !pack) schedule();
  });
  plugin.app.workspace.onLayoutReady(() => {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-path"] });
    if (document.querySelector(".nav-file-title, .nav-folder-title")) { document.querySelectorAll(".nav-file-title[data-path], .nav-folder-title[data-path]").forEach(title => pending.add(title)); schedule(); }
  });
  for (const event of ["create", "delete", "rename"]) plugin.registerEvent(plugin.app.vault.on(event, () => window.setTimeout(refreshFolders, 50)));
  plugin.register(() => { observer.disconnect(); window.cancelAnimationFrame(frame); });
}
