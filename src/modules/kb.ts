import { ItemView, Platform, Setting, TFile } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import { tr, zh } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { KbIndex } from "./kb-index.js";
import { KB_DEFAULT_FOLDERS, KB_DEFAULT_THRESHOLDS, cleanFolder, normalizeKbSettings } from "./kb-index-core.js";
import type { KbFeatures, KbFolders, KbSettings, KbThresholds } from "./kb-index-core.js";

/* Knowledge-base views: one shared index, one settings group, and a registry each view adds itself to.
   Every feature is off until switched on in settings. */

export interface KbFeatureSpec {
  key: keyof KbFeatures;
  /** View type; omitted for features without a view of their own. */
  view?: string;
  name: string;
  icon: string;
  create?: (leaf: WorkspaceLeaf, plugin: IgnorancePlugin) => ItemView;
  install?: (plugin: IgnorancePlugin) => void;
  onToggle?: (plugin: IgnorancePlugin, enabled: boolean) => void;
}

const FEATURES: KbFeatureSpec[] = [];
let index: KbIndex | null = null;

export function registerKbFeature(spec: KbFeatureSpec) { FEATURES.push(spec); }

/** Enabled features that have a view, for the shortcuts in each view's header. */
export function kbViews(plugin: IgnorancePlugin): KbFeatureSpec[] {
  return FEATURES.filter(spec => spec.view && kbEnabled(plugin, spec.key));
}

export function kbSettings(plugin: IgnorancePlugin): KbSettings {
  if (!plugin.state.kb) plugin.state.kb = normalizeKbSettings(undefined);
  return plugin.state.kb;
}

export function kbEnabled(plugin: IgnorancePlugin, key: keyof KbFeatures): boolean {
  return kbSettings(plugin).features[key];
}

/** The shared index, built on first use. */
export function kbIndex(plugin: IgnorancePlugin): KbIndex {
  if (!index) {
    index = new KbIndex(plugin.app, () => kbSettings(plugin).folders);
    index.start();
  }
  return index;
}

export async function openKbView(plugin: IgnorancePlugin, type: string, state?: Record<string, unknown>) {
  const { workspace } = plugin.app;
  let leaf = workspace.getLeavesOfType(type)[0];
  if (!leaf) {
    leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type, active: true, state });
  } else if (state) await leaf.setViewState({ type, active: true, state });
  await workspace.revealLeaf(leaf);
}

export function openNote(plugin: IgnorancePlugin, path: string, newTab = false) {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) void plugin.app.workspace.getLeaf(newTab ? "tab" : Platform.isPhone ? false : "tab").openFile(file);
}

/** Base for the knowledge views: redraws when the index changes, keeps scroll position. */
export abstract class KbView extends ItemView {
  plugin: IgnorancePlugin;
  private unsubscribe: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: IgnorancePlugin) { super(leaf); this.plugin = plugin; }

  get index() { return kbIndex(this.plugin); }
  get folders(): KbFolders { return kbSettings(this.plugin).folders; }

  abstract draw(root: HTMLElement): void | Promise<void>;

  onOpen(): Promise<void> {
    this.contentEl.addClass("ig-kb");
    this.unsubscribe = this.index.subscribe(() => this.redraw());
    this.redraw();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    return Promise.resolve();
  }

  redraw() {
    const scroll = this.contentEl.scrollTop;
    this.contentEl.empty();
    void Promise.resolve(this.draw(this.contentEl)).then(() => { this.contentEl.scrollTop = scroll; });
  }
}

const THRESHOLD_FIELDS: { key: keyof KbThresholds; name: string }[] = [
  { key: "inboxStaleDays", name: zh("收件箱积压天数") },
  { key: "overdueMin", name: zh("逾期任务提醒阈值") },
  { key: "productStaleDays", name: zh("产品线未更新天数") }
];

const FOLDER_FIELDS: { key: Exclude<keyof KbFolders, "exclude">; name: string }[] = [
  { key: "inbox", name: zh("收件箱目录") },
  { key: "nav", name: zh("导航目录") },
  { key: "work", name: zh("工作目录") },
  { key: "personal", name: zh("个人目录") },
  { key: "knowledge", name: zh("知识目录") },
  { key: "archive", name: zh("归档目录") }
];

/** The 知识库 settings group: one switch per view, then the folder roles. */
export function kbSettingItems(plugin: IgnorancePlugin) {
  const settings = kbSettings(plugin);
  const save = () => { plugin.saveStoredState(); index?.reset(); };
  const items: { name: string; desc: string; aliases?: string[]; add: (setting: Setting) => unknown }[] = FEATURES.map(spec => ({
    name: tr(spec.name), desc: "", aliases: ["knowledge base", spec.key],
    add: (setting: Setting) => setting.addToggle(toggle => toggle.setValue(settings.features[spec.key]).onChange(value => {
      settings.features[spec.key] = value; plugin.saveStoredState();
      if (!value && spec.view) plugin.app.workspace.detachLeavesOfType(spec.view);
      spec.onToggle?.(plugin, value);
    }))
  }));
  if (FEATURES.some(spec => spec.key === "home")) items.splice(1, 0, {
    name: tr("启动时打开知识首页"), desc: "",
    add: (setting: Setting) => setting.addToggle(toggle => toggle.setValue(settings.openHomeOnStartup).onChange(value => { settings.openHomeOnStartup = value; plugin.saveStoredState(); }))
  });
  for (const field of FOLDER_FIELDS) items.push({
    name: tr(field.name), desc: "", add: (setting: Setting) => setting.addText(text => text
      .setPlaceholder(KB_DEFAULT_FOLDERS[field.key]).setValue(settings.folders[field.key])
      .onChange(value => { settings.folders[field.key] = cleanFolder(value) || KB_DEFAULT_FOLDERS[field.key]; save(); }))
  });
  for (const field of THRESHOLD_FIELDS) items.push({
    name: tr(field.name), desc: "", add: (setting: Setting) => setting.addText(text => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.setValue(String(settings.thresholds[field.key])).onChange(value => {
        const n = Number(value);
        settings.thresholds[field.key] = Number.isFinite(n) && n >= 0 ? Math.round(n) : KB_DEFAULT_THRESHOLDS[field.key];
        plugin.saveStoredState(); index?.notify();
      });
    })
  });
  items.push({
    name: tr("排除目录"), desc: "", add: (setting: Setting) => setting.addTextArea(text => {
      text.setPlaceholder(KB_DEFAULT_FOLDERS.exclude.join("\n")).setValue(settings.folders.exclude.join("\n"))
        .onChange(value => { settings.folders.exclude = value.split("\n").map(cleanFolder).filter(Boolean); save(); });
      text.inputEl.rows = 3;
    })
  });
  return items;
}

export function installKnowledgeBase(plugin: IgnorancePlugin) {
  plugin.state.kb = normalizeKbSettings(plugin.state.kb);
  for (const spec of FEATURES) {
    const { view, create } = spec;
    if (view && create) {
      plugin.registerView(view, leaf => create(leaf, plugin));
      plugin.addCommand({
        id: `kb-open-${spec.key}`, name: tr(spec.name), icon: spec.icon,
        checkCallback: checking => {
          if (!kbEnabled(plugin, spec.key)) return false;
          if (!checking) void openKbView(plugin, view);
          return true;
        }
      });
    }
    spec.install?.(plugin);
  }
  plugin.register(() => { index?.stop(); index = null; });
}
