import { FuzzySuggestModal, Notice, TFile, normalizePath } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { askText } from "./prompt-modal.js";
import { saveExportToVault } from "./export.js";
import { applyLayout, cleanLayouts, uniqueLayoutName, type PageLike } from "./layout-library-core.js";
import { buildPack, fillTemplate, readPack, safeFileName, stripTemplateLayout, templateLayoutName } from "./template-core.js";
import { savePageSettings } from "./page-controls.js";
/* Your own note templates: Markdown files in a folder you choose (设置 → 模板文件夹). A template can use
   {{title}} {{author}} {{date}} {{time}} {{datetime}} and name a layout in its front matter (`ib-layout: 周报`),
   which is applied when a note is made from it. Templater or QuickAdd can call the same thing through the
   plugin's `api`. */

const folderOf = (plugin: IgnorancePlugin) => normalizePath(plugin.state.userTemplates?.folder?.trim() || "");

export function templateFiles(plugin: IgnorancePlugin): TFile[] {
  const folder = folderOf(plugin);
  if (!folder || folder === "/") return [];
  return plugin.app.vault.getMarkdownFiles().filter(file => file.path.startsWith(`${folder}/`)).sort((a, b) => a.path.localeCompare(b.path, "zh"));
}

export interface CreatedNote { file: TFile; layoutApplied: string | null; layoutMissing: string | null }

/** Makes a note from a template file. `folder` defaults to the open note's folder, then the vault root. */
export async function createNoteFromTemplate(plugin: IgnorancePlugin, template: TFile, title: string, folder?: string): Promise<CreatedNote> {
  const { app } = plugin;
  const raw = await app.vault.cachedRead(template);
  const layoutName = templateLayoutName(raw);
  const body = fillTemplate(stripTemplateLayout(raw), { title, author: plugin.state.userTemplates?.author ?? "", now: new Date() });
  const parent = folder ?? app.workspace.getActiveFile()?.parent?.path ?? "";
  const base = safeFileName(title);
  const prefix = parent && parent !== "/" ? `${normalizePath(parent)}/` : "";
  let path = `${prefix}${base}.md`;
  for (let index = 2; app.vault.getAbstractFileByPath(path); index += 1) path = `${prefix}${base} ${index}.md`;
  const file = await app.vault.create(path, body);
  let layoutApplied: string | null = null, layoutMissing: string | null = null;
  if (layoutName) {
    const record = (plugin.state.layouts ?? []).find(item => item.name === layoutName || item.id === layoutName);
    if (record) {
      applyLayout(plugin.state.page as unknown as PageLike, record.settings);
      if (record.settings.wordFont) plugin.state.wordFont = record.settings.wordFont;
      plugin.saveStoredState();
      savePageSettings(plugin);
      layoutApplied = record.name;
    } else layoutMissing = layoutName;
  }
  return { file, layoutApplied, layoutMissing };
}

class TemplatePicker extends FuzzySuggestModal<TFile> {
  constructor(private plugin: IgnorancePlugin, private files: TFile[], private choose: (file: TFile) => void) {
    super(plugin.app);
    this.setPlaceholder(tr("选择模板"));
  }
  getItems() { return this.files; }
  getItemText(file: TFile) { return file.path.slice(folderOf(this.plugin).length + 1).replace(/\.md$/, ""); }
  onChooseItem(file: TFile) { this.choose(file); }
}

async function newFromTemplate(plugin: IgnorancePlugin) {
  const files = templateFiles(plugin);
  if (!files.length) {
    new Notice(plugin.state.userTemplates?.folder ? tr("模板文件夹「{folder}」里还没有 Markdown 模板", { folder: plugin.state.userTemplates.folder }) : tr("先在设置里指定模板文件夹"), 6000);
    return;
  }
  new TemplatePicker(plugin, files, template => {
    void (async () => {
      const title = await askText(plugin.app, { heading: tr("新笔记标题"), initial: template.basename, confirm: tr("创建") });
      if (title === null) return;
      const made = await createNoteFromTemplate(plugin, template, title.trim() || template.basename);
      await plugin.app.workspace.getLeaf(false).openFile(made.file);
      if (made.layoutApplied) new Notice(tr("已套用版式「{name}」", { name: made.layoutApplied }));
      if (made.layoutMissing) new Notice(tr("模板指定的版式「{name}」在这个库里不存在，没有套用", { name: made.layoutMissing }), 6000);
    })();
  }).open();
}

async function exportPack(plugin: IgnorancePlugin) {
  const files = templateFiles(plugin);
  if (!files.length) { new Notice(tr("先在设置里指定模板文件夹，并放入模板"), 5000); return; }
  const folder = folderOf(plugin);
  const templates = await Promise.all(files.map(async file => ({ name: file.path.slice(folder.length + 1).replace(/\.md$/, ""), content: await plugin.app.vault.cachedRead(file) })));
  const path = await saveExportToVault(plugin, `${tr("模板包")}.json`, buildPack(templates, plugin.state.layouts ?? []));
  new Notice(tr("已保存：{path}", { path }));
}

async function importPack(plugin: IgnorancePlugin) {
  const folder = folderOf(plugin);
  if (!folder || folder === "/") { new Notice(tr("先在设置里指定模板文件夹"), 5000); return; }
  const text = await askText(plugin.app, { heading: tr("导入模板包"), hint: tr("粘贴从其他库导出的模板包 JSON。同名模板不会被覆盖，会自动加序号。"), multiline: true, confirm: tr("导入") });
  if (text === null) return;
  const { vault } = plugin.app;
  if (!vault.getAbstractFileByPath(folder)) await vault.createFolder(folder).catch(() => undefined);
  const existing = templateFiles(plugin).map(file => file.path.slice(folder.length + 1).replace(/\.md$/, ""));
  const pack = readPack(text, existing);
  if (pack.error) { new Notice(tr(pack.error)); return; }
  for (const item of pack.add) {
    const slash = item.name.lastIndexOf("/");
    if (slash > 0 && !vault.getAbstractFileByPath(`${folder}/${item.name.slice(0, slash)}`)) await vault.createFolder(`${folder}/${item.name.slice(0, slash)}`).catch(() => undefined);
    await vault.create(`${folder}/${item.name}.md`, item.content);
  }
  const layouts = plugin.state.layouts ??= [];
  let addedLayouts = 0;
  for (const record of cleanLayouts(pack.layouts)) {
    if (layouts.some(item => item.id === record.id)) continue;
    layouts.push({ ...record, name: uniqueLayoutName(record.name, layouts.map(item => item.name)), updatedAt: Date.now() });
    addedLayouts += 1;
  }
  if (addedLayouts) plugin.saveStoredState();
  new Notice(tr("已导入 {templates} 个模板、{layouts} 个版式", { templates: pack.add.length, layouts: addedLayouts }) + (pack.renamed.length ? `；${tr("重名的已改名")}：${pack.renamed.slice(0, 4).join("、")}` : ""), 8000);
}

export function installUserTemplates(plugin: IgnorancePlugin) {
  plugin.addCommand({ id: "template-new", name: tr("从模板新建笔记"), icon: "lucide-file-plus", callback: () => { void newFromTemplate(plugin); } });
  plugin.addCommand({ id: "template-export-pack", name: tr("导出模板包（模板和版式）"), icon: "lucide-package", callback: () => { void exportPack(plugin); } });
  plugin.addCommand({ id: "template-import-pack", name: tr("导入模板包"), icon: "lucide-package-open", callback: () => { void importPack(plugin); } });
}
