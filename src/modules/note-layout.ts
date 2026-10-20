import type { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { lookupLayout } from "./layout-library.js";
import { setPageOverride } from "./page-controls.js";
/* A note can name a layout in its properties (`ib-layout: 论文`, a built-in or saved one, by name or id). That
   layout applies while the note is open; opening another note puts the device\'s own page settings back. */

let pinned: string | null = null;
export const pinnedLayoutName = () => pinned;

/** Writes (or, with null, removes) the note\'s `ib-layout` property. */
export async function pinLayoutToNote(plugin: IgnorancePlugin, file: TFile, name: string | null) {
  await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    if (name) frontmatter["ib-layout"] = name; else delete frontmatter["ib-layout"];
  });
  syncNoteLayout(plugin);
}

export function syncNoteLayout(plugin: IgnorancePlugin) {
  const file = plugin.app.workspace.getActiveFile();
  const key: unknown = file?.extension === "md" ? plugin.app.metadataCache.getFileCache(file)?.frontmatter?.["ib-layout"] : undefined;
  const record = typeof key === "string" ? lookupLayout(plugin, key) : undefined;
  pinned = record?.name ?? null;
  setPageOverride(plugin, record ?? null);
}

export function installNoteLayout(plugin: IgnorancePlugin) {
  const later = () => window.setTimeout(() => syncNoteLayout(plugin), 0);
  plugin.registerEvent(plugin.app.workspace.on("file-open", later));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", later));
  plugin.registerEvent(plugin.app.metadataCache.on("changed", file => { if (file === plugin.app.workspace.getActiveFile()) syncNoteLayout(plugin); }));
  later();
}
