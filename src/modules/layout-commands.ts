import { Notice, SuggestModal } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import type { LayoutRecord } from "./layout-library-core.js";
import { applyUserLayout, openLayoutManager, saveCurrentAsLayout, savedLayouts } from "./layout-library.js";
import { savePageSettings } from "./page-controls.js";
/* The saved layouts are also reachable from the command palette, so they can be used where the page toolbar is not
   shown (a phone, for one). The commands do the same things as the entries of the page menu's layout submenu. */
class LayoutPicker extends SuggestModal<LayoutRecord> {
  constructor(private plugin: IgnorancePlugin, private onApplied: () => void) {
    super(plugin.app);
    this.setPlaceholder("选择要套用的版式");
  }
  getSuggestions(query: string) {
    const text = query.trim().toLowerCase();
    return savedLayouts(this.plugin).filter(record => record.name.toLowerCase().includes(text));
  }
  renderSuggestion(record: LayoutRecord, element: HTMLElement) { element.setText(record.name); }
  onChooseSuggestion(record: LayoutRecord) { applyUserLayout(this.plugin, record, this.onApplied); }
}

export function installLayoutCommands(plugin: IgnorancePlugin) {
  const refresh = () => savePageSettings(plugin);
  plugin.addCommand({ id: "layout-save", name: "保存当前页面设置为版式", icon: "lucide-save", callback: () => saveCurrentAsLayout(plugin, refresh) });
  plugin.addCommand({
    id: "layout-apply", name: "套用已保存的版式", icon: "lucide-bookmark",
    callback: () => { if (!savedLayouts(plugin).length) { new Notice("还没有保存过版式，先用「保存当前页面设置为版式」", 5000); return; } new LayoutPicker(plugin, refresh).open(); }
  });
  plugin.addCommand({ id: "layout-manage", name: "管理已保存的版式", icon: "lucide-settings-2", callback: () => openLayoutManager(plugin, refresh) });
}
