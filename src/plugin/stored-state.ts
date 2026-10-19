import { normalizeWordFont } from "../modules/word-font.js";
import { setLanguagePreference } from "../i18n.js";
import { Notice } from "obsidian";
import { appearanceDefaults,applyAppearancePreferences,tabDefaults } from "../modules/appearance.js";
import { DENSITIES,writingModeDefaults } from "../modules/editor-tools.js";
import { fileToolsDefaults } from "../modules/file-tools.js";
import { t } from "../modules/mermaid-core.js";
import { normalizePresentationSkin } from "../modules/skin-choice.js";
import type { IgnorancePlugin, PluginState } from "../plugin-types.js";
import { cleanLayouts, cleanTombstones, mergeLayouts } from "../modules/layout-library-core.js";
import { mergeReadingPositions } from "../modules/reading-position.js";

/* Settings and per-note state: load, save (debounced), and the body classes that follow them. */

export async function loadStoredState(plugin: IgnorancePlugin) {
  const stored: unknown = await plugin.loadData();
  const loaded = typeof stored === "object" && stored !== null ? stored as Partial<PluginState> : {};
  plugin.state = Object.assign({
    density: "normal", tables: {}, accent: "none", customAccent: "#4D81EF", presentation: { skin: "none", animation: "none", canvas: "16:9" },
    appearance: appearanceDefaults(), tabs: tabDefaults(), smartPunctuation: false
  }, loaded) as PluginState;
  plugin.state.presentation = { ...plugin.state.presentation, skin: normalizePresentationSkin(plugin.state.presentation?.skin) };
  delete plugin.state.htmlSkin;
  plugin.state.appearance = Object.assign(appearanceDefaults(), plugin.state.appearance || {});
  plugin.state.tabs = Object.assign(tabDefaults(), plugin.state.tabs || {});
  plugin.state.codeLineNumbers = plugin.state.codeLineNumbers === true;
  plugin.state.smartPunctuation = plugin.state.smartPunctuation === true;
  plugin.state.headingNumbers = plugin.state.headingNumbers === true;
  plugin.state.lenientBlocks = plugin.state.lenientBlocks !== false;
  plugin.state.tableCrosshair = plugin.state.tableCrosshair === true;
  plugin.state.autoFoldCode = plugin.state.autoFoldCode === true;
  plugin.state.headingNumberStyle = plugin.state.headingNumberStyle === "chinese" ? "chinese" : "decimal";
  plugin.state.headingNumberStart = plugin.state.headingNumberStart === "h1" || plugin.state.headingNumberStart === "h2" ? plugin.state.headingNumberStart : "auto";
  plugin.state.headingNumberSkipOwn = plugin.state.headingNumberSkipOwn !== false;
  plugin.state.headingNumberDepth = Math.min(6, Math.max(1, Math.round(Number(plugin.state.headingNumberDepth)) || 4));
  plugin.state.captions = plugin.state.captions === true;
  plugin.state.wordFont = normalizeWordFont(plugin.state.wordFont);
  plugin.state.layouts = cleanLayouts(plugin.state.layouts);
  plugin.state.layoutTombstones = cleanTombstones(plugin.state.layoutTombstones);
  plugin.state.enhance = Object.fromEntries(Object.entries(plugin.state.enhance ?? {}).filter(([, value]) => value === false));
  plugin.state.userTemplates = { folder: typeof plugin.state.userTemplates?.folder === "string" ? plugin.state.userTemplates.folder : "", author: typeof plugin.state.userTemplates?.author === "string" ? plugin.state.userTemplates.author : "" };
  plugin.state.language = plugin.state.language === "zh" || plugin.state.language === "en" ? plugin.state.language : "auto";
  setLanguagePreference(plugin.state.language);
  plugin.state.customCallouts = typeof plugin.state.customCallouts === "string" ? plugin.state.customCallouts : "";
  plugin.state.grayDates = typeof plugin.state.grayDates === "string" ? plugin.state.grayDates : "";
  plugin.state.writingModes = Object.assign(writingModeDefaults(), plugin.state.writingModes || {});
  plugin.state.fileTools = Object.assign(fileToolsDefaults(), plugin.state.fileTools || {});
  plugin.state.webClip = Object.assign({ watchClipboard: false, folder: "", byDomain: false }, plugin.state.webClip || {});
  plugin.state.readingTime = Object.assign({ enabled: true }, plugin.state.readingTime || {});
  // Existing installs have stored data and have already found their way around; only a fresh install gets the hint.
  if (plugin.state.introShown === undefined) plugin.state.introShown = Boolean(stored);
  // "Open with" apps were removed along with the shell access they needed.
  delete plugin.state.fileTools.apps;
  delete plugin.state.pageDefaults;
  plugin.applyDensity();
  applyAppearancePreferences(plugin);
  plugin.applyCodeLineNumbers();
}

// Called by Obsidian when data.json was changed by sync from another device.
export async function mergeExternalState(plugin: IgnorancePlugin) {
  const stored: unknown = await plugin.loadData();
  if (typeof stored !== "object" || stored === null || !plugin.state) return;
  const remote = stored as Partial<PluginState>;
  mergeReadingPositions(plugin, remote.readingPositions);
  // Layouts are merged by id so a layout added on another device is neither lost nor overwritten by this device's next save.
  const merged = mergeLayouts(plugin.state.layouts ?? [], cleanLayouts(remote.layouts), plugin.state.layoutTombstones ?? [], cleanTombstones(remote.layoutTombstones));
  const changed = JSON.stringify(merged.layouts) !== JSON.stringify(plugin.state.layouts) || JSON.stringify(merged.tombstones) !== JSON.stringify(plugin.state.layoutTombstones);
  plugin.state.layouts = merged.layouts;
  plugin.state.layoutTombstones = merged.tombstones;
  if (changed) saveStoredState(plugin);
}

export function saveStoredState(plugin: IgnorancePlugin) {
  window.clearTimeout(plugin.saveTimer);
  // Page layout lives in per-device local storage, never in synced data.
  plugin.saveTimer = window.setTimeout(() => {
    const { page, ...synced } = plugin.state;
    void plugin.saveData(synced);
  }, 250);
}

export function applyDensity(plugin: IgnorancePlugin) {
  for (const name of DENSITIES) {
    document.body.classList.toggle(`ibt-density-${name}`, plugin.state.density === name);
  }
}

export function applyCodeLineNumbers(plugin: IgnorancePlugin) {
  document.body.classList.toggle("ib-show-code-line-numbers", plugin.state?.codeLineNumbers === true);
}

export function cycleDensity(plugin: IgnorancePlugin) {
  const next = (DENSITIES.indexOf(plugin.state.density) + 1) % DENSITIES.length;
  plugin.state.density = DENSITIES[next];
  plugin.applyDensity();
  plugin.saveStoredState();
  new Notice(`${t("density")}: ${t(`density_${plugin.state.density}`)}`);
}
