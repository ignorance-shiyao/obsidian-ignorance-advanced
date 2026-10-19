import type { Menu } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Modal, Notice } from "obsidian";
import { applyLayout, exportLayouts, importLayouts, layoutChanges, snapshotLayout, uniqueLayoutName, type LayoutRecord, type PageLike } from "./layout-library-core.js";
import { saveExportToVault } from "./export.js";
/* "My layouts": save the current page settings under a name, apply one later (after listing what it changes),
   copy, rename, delete, and move them between vaults as a JSON file. */

const layouts = (plugin: IgnorancePlugin): LayoutRecord[] => (plugin.state.layouts ??= []);
const current = (plugin: IgnorancePlugin) => snapshotLayout(plugin.state.page as unknown as PageLike, plugin.state.wordFont);

function persist(plugin: IgnorancePlugin) { plugin.saveStoredState(); }

class TextModal extends Modal {
  constructor(plugin: IgnorancePlugin, private heading: string, private hint: string, private initial: string, private multiline: boolean, private submit: (value: string) => void) { super(plugin.app); }
  onOpen() {
    this.setTitle(this.heading);
    if (this.hint) this.contentEl.createDiv({ cls: "ib-form-hint", text: this.hint });
    const input = this.multiline
      ? this.contentEl.createEl("textarea", { cls: "ibp-layout-text", attr: { rows: "8", spellcheck: "false" } })
      : this.contentEl.createEl("input", { cls: "ib-footer-input", attr: { type: "text" } });
    input.value = this.initial;
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    const done = () => { this.submit(input.value); this.close(); };
    footer.createEl("button", { cls: "mod-cta", text: "确定" }).addEventListener("click", done);
    if (!this.multiline) input.addEventListener("keydown", (event: Event) => { if ((event as KeyboardEvent).key === "Enter") done(); });
    window.setTimeout(() => input.focus(), 50);
  }
  onClose() { this.contentEl.empty(); }
}

class ConfirmApplyModal extends Modal {
  constructor(private plugin: IgnorancePlugin, private record: LayoutRecord, private changes: ReturnType<typeof layoutChanges>, private apply: () => void) { super(plugin.app); }
  onOpen() {
    this.setTitle(`套用「${this.record.name}」`);
    this.contentEl.createDiv({ cls: "ib-form-hint", text: `会改变 ${this.changes.length} 项设置，颜色不受影响：` });
    const list = this.contentEl.createEl("ul", { cls: "ibp-layout-changes" });
    for (const change of this.changes) list.createEl("li", { text: `${change.label}：${change.from} → ${change.to}` });
    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "取消" }).addEventListener("click", () => this.close());
    footer.createEl("button", { cls: "mod-cta", text: "套用" }).addEventListener("click", () => { this.apply(); this.close(); });
  }
  onClose() { this.contentEl.empty(); }
}

export function applyUserLayout(plugin: IgnorancePlugin, record: LayoutRecord, onApplied: () => void) {
  const changes = layoutChanges(current(plugin), record.settings);
  if (!changes.length) { new Notice("当前设置和这个版式一样，没有需要改的。"); return; }
  new ConfirmApplyModal(plugin, record, changes, () => {
    applyLayout(plugin.state.page as unknown as PageLike, record.settings);
    if (record.settings.wordFont) plugin.state.wordFont = record.settings.wordFont;
    persist(plugin);
    onApplied();
    new Notice(`已套用版式「${record.name}」`);
  }).open();
}

export function saveCurrentAsLayout(plugin: IgnorancePlugin, onChanged: () => void) {
  new TextModal(plugin, "保存当前设置为版式", "保存宽度、纸张、页边距、页眉页脚、分页和 Word 字体；不保存颜色和缩放。", "", false, value => {
    const name = uniqueLayoutName(value, layouts(plugin).map(item => item.name));
    layouts(plugin).push({ id: window.crypto.randomUUID(), name, settings: current(plugin), updatedAt: Date.now() });
    persist(plugin);
    onChanged();
    new Notice(`已保存版式「${name}」`);
  }).open();
}

export function openLayoutManager(plugin: IgnorancePlugin, onApplied: () => void) { new ManageModal(plugin, onApplied).open(); }
export const savedLayouts = layouts;

class ManageModal extends Modal {
  constructor(private plugin: IgnorancePlugin, private onApplied: () => void) { super(plugin.app); }
  onOpen() { this.setTitle("我的版式"); this.render(); }
  onClose() { this.contentEl.empty(); }
  render() {
    const { contentEl, plugin } = this;
    contentEl.empty();
    const list = layouts(plugin);
    if (!list.length) contentEl.createDiv({ cls: "ib-form-hint", text: "还没有保存的版式。先调好页面设置，再在「版式」菜单里选「保存当前设置」。" });
    for (const record of list) {
      const row = contentEl.createDiv({ cls: "ibp-layout-row" });
      row.createSpan({ cls: "ibp-layout-name", text: record.name });
      const button = (text: string, action: () => void) => row.createEl("button", { text }).addEventListener("click", action);
      button("套用", () => { this.close(); applyUserLayout(plugin, record, this.onApplied); });
      button("改名", () => new TextModal(plugin, "重命名版式", "", record.name, false, value => {
        record.name = uniqueLayoutName(value, list.filter(item => item !== record).map(item => item.name));
        record.updatedAt = Date.now();
        persist(plugin); this.render();
      }).open());
      button("复制", () => {
        list.push({ id: window.crypto.randomUUID(), name: uniqueLayoutName(`${record.name} 副本`, list.map(item => item.name)), settings: { ...record.settings }, updatedAt: Date.now() });
        persist(plugin); this.render();
      });
      button("删除", () => {
        list.splice(list.indexOf(record), 1);
        (plugin.state.layoutTombstones ??= []).push({ id: record.id, at: Date.now() });
        persist(plugin); this.render();
      });
    }
    const footer = contentEl.createDiv({ cls: "modal-button-container" });
    footer.createEl("button", { text: "导入…" }).addEventListener("click", () => importFromText(plugin, () => this.render()));
    const exportButton = footer.createEl("button", { text: "导出全部" });
    exportButton.disabled = !list.length;
    exportButton.addEventListener("click", () => {
      void saveExportToVault(plugin, "我的版式.json", exportLayouts(list)).then(path => new Notice(`已保存：${path}`));
    });
  }
}

function importFromText(plugin: IgnorancePlugin, onDone: () => void) {
  new TextModal(plugin, "导入版式", "粘贴从其他地方导出的版式 JSON。", "", true, text => {
    const result = importLayouts(text);
    if (result.error) { new Notice(result.error); return; }
    const list = layouts(plugin);
    for (const item of result.layouts) {
      const base = snapshotLayout(plugin.state.page as unknown as PageLike, plugin.state.wordFont);
      list.push({ id: window.crypto.randomUUID(), name: uniqueLayoutName(item.name, list.map(entry => entry.name)), settings: { ...base, ...item.settings }, updatedAt: Date.now() });
    }
    persist(plugin);
    onDone();
    new Notice(`已导入 ${result.layouts.length} 个版式` + (result.dropped.length ? `；忽略了无法识别的内容：${result.dropped.slice(0, 5).join("、")}` : ""), 8000);
  }).open();
}

/** The user's layouts, plus save and manage entries, added to the page menu's layout submenu. */
export function addLayoutItems(plugin: IgnorancePlugin, menu: Menu, onApplied: () => void) {
  const list = layouts(plugin);
  if (list.length) {
    menu.addSeparator();
    for (const record of list) menu.addItem(item => item.setTitle(record.name).setIcon("bookmark").onClick(() => applyUserLayout(plugin, record, onApplied)));
  }
  menu.addSeparator();
  menu.addItem(item => item.setTitle("保存当前设置…").setIcon("save").onClick(() => saveCurrentAsLayout(plugin, onApplied)));
  menu.addItem(item => item.setTitle("管理…").setIcon("settings-2").onClick(() => new ManageModal(plugin, onApplied).open()));
}
