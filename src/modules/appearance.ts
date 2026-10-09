import { setIcon } from "./ui-icons.js";
import { THEME_PRESETS, THEME_TOKEN_NAMES, composeThemeTokens } from "./theme-presets.js";
import { applyFontPreferences, clearFontPreferences, migrateLegacyFonts } from "./fonts.js";
import { applyLineHeightPreference, clearLineHeightPreference } from "./line-height.js";
const { Notice, Menu, Platform, Setting } = require("obsidian");

const ACCENT_PRESETS = THEME_PRESETS.map(preset => ({ value: preset.id, label: preset.label, color: preset.accent }));
const CUSTOM_ACCENT = "ib-accent-custom";
// Earlier accents and presets, folded into the nearest of the eight palettes.
const LEGACY_PRESETS = {
  none: "azure",
  indigo: "azure",
  "ib-accent-indigo": "azure",
  "ib-accent-teal": "teal",
  "ib-accent-green": "pine",
  "ib-accent-amber": "amber",
  "ib-accent-rose": "terracotta",
  "ib-accent-violet": "wisteria",
  "ib-accent-graphite": "graphite",
  "moon-white": "azure",
  "clear-blue": "azure",
  "ink-night": "azure",
  "green-mist": "teal",
  verdant: "pine",
  "dai-purple": "wisteria",
  cinnabar: "terracotta",
  "orange-isle": "amber",
  "rice-paper": "book",
  "pine-smoke": "graphite"
};

function presetId(value) {
  const mapped = LEGACY_PRESETS[value] || value;
  return THEME_PRESETS.some(preset => preset.id === mapped) ? mapped : "azure";
}

function selectedPresetId(plugin) {
  const appearance = plugin.state.appearance || {};
  return plugin.state.accent === CUSTOM_ACCENT
    ? presetId(appearance.themePreset || "azure")
    : presetId(plugin.state.accent || "none");
}

function currentThemeMode() {
  return document.body.classList.contains("theme-dark") ? "dark" : "light";
}

function writeThemePalette(preset, mode, accentOverride) {
  for (const [name, value] of Object.entries(composeThemeTokens(preset, mode, accentOverride))) {
    document.body.style.setProperty(name, value);
  }
  document.body.dataset.ibThemePreset = preset;
}

function writeCustomPalette(hex, preset = "azure") {
  writeThemePalette(preset, currentThemeMode(), hex);
}

function appearanceDefaults() {
  return {
    hideHeadingLabels: false, headingBadge: false, decorations: true, tableAlignment: "left", cardRadius: 8, themePreset: "azure",
    fontHeading: "theme", lineHeight: "theme"
  };
}

function tabDefaults() {
  return { openInNewTab: true, deduplicateTabs: true, deduplicateAcrossTabGroups: true };
}

function currentAccent(plugin) {
  return plugin.state.accent === CUSTOM_ACCENT ? CUSTOM_ACCENT : presetId(plugin.state.accent || "none");
}

function applyAppearancePreferences(plugin) {
  const body = document.body;
  const appearance = Object.assign(appearanceDefaults(), plugin.state.appearance || {});
  plugin.state.appearance = appearance;
  const selected = selectedPresetId(plugin);
  const custom = plugin.state.accent === CUSTOM_ACCENT;
  delete appearance.followAccent;
  const accentOverride = custom ? plugin.state.customAccent : undefined;
  writeThemePalette(selected, currentThemeMode(), accentOverride);
  applyFontPreferences(body, appearance);
  applyLineHeightPreference(body, appearance.lineHeight);
  body.classList.toggle("ib-theme-text-size", plugin.app.vault.getConfig("baseFontSize") == null);
  body.classList.toggle(CUSTOM_ACCENT, custom);
  body.classList.toggle("ib-hide-heading-labels", Boolean(appearance.hideHeadingLabels));
  body.classList.toggle("ib-heading-badge", Boolean(appearance.headingBadge));
  body.dataset.ibTableAlignment = ["left", "center", "right"].includes(appearance.tableAlignment) ? appearance.tableAlignment : "left";
  body.classList.toggle("ib-hide-decorations", appearance.decorations === false);
  body.style.setProperty("--ib-card-radius", String(Math.max(0, Math.min(16, Number(appearance.cardRadius) || 0)) + "px"));
  const stamp = `${selected}|${currentThemeMode()}|${accentOverride || ""}|${appearance.fontHeading}|${appearance.lineHeight}`;
  if (body.dataset.ibThemeStamp !== stamp) {
    body.dataset.ibThemeStamp = stamp;
    window.dispatchEvent(new CustomEvent("ib-theme-change"));
  }

}

function clearAppearancePreferences() {
  document.body.classList.remove(CUSTOM_ACCENT, "ib-hide-heading-labels", "ib-heading-badge", "ib-hide-decorations", "ib-theme-text-size");
  delete document.body.dataset.ibThemePreset;
  delete document.body.dataset.ibTableAlignment;
  document.body.style.removeProperty("--ib-card-radius");
  for (const name of THEME_TOKEN_NAMES) document.body.style.removeProperty(name);
  clearFontPreferences(document.body);
  clearLineHeightPreference(document.body);
  for (const name of ["--ibc-light-brand", "--ibc-light-solid", "--ibc-light-text", "--ibc-light-on", "--ibc-dark-brand", "--ibc-dark-solid", "--ibc-dark-text", "--ibc-dark-on"]) {
    document.body.style.removeProperty(name);
  }
}

function applyAccent(plugin, value) {
  plugin.state.appearance ||= appearanceDefaults();
  if (value === CUSTOM_ACCENT) {
    if (plugin.state.accent !== CUSTOM_ACCENT) plugin.state.appearance.themePreset = presetId(plugin.state.accent || "none");
    plugin.state.accent = CUSTOM_ACCENT;
  } else {
    plugin.state.accent = presetId(value);
    plugin.state.appearance.themePreset = presetId(value);
  }
  applyAppearancePreferences(plugin);
  plugin.saveStoredState();
}

function addDropdownSetting(container, name, description, value, options, onChange) {
  new Setting(container).setName(name).setDesc(description).addDropdown(dropdown => {
    for (const [optionValue, label] of options) dropdown.addOption(optionValue, label);
    dropdown.setValue(String(value));
    dropdown.onChange(onChange);
  });
}


function themeMode(app) {
  return app.vault.getConfig("theme") === "system" ? "system" : (app.isDarkMode() ? "dark" : "light");
}

function setThemeMode(app, mode) {
  app.changeTheme(mode === "system" ? "system" : (mode === "dark" ? "obsidian" : "moonstone"));
  app.updateTheme?.();
}

function installAppearanceControls(plugin) {
  const app = plugin.app;
  if (migrateLegacyFonts(app, plugin.state.appearance || {})) plugin.saveStoredState();
  applyAppearancePreferences(plugin);

  const modeIcon = () => ({ system: "lucide-sun-moon", dark: "lucide-moon", light: "lucide-sun" })[themeMode(app)];
  let popover = null;
  const closePopover = () => { popover?.remove(); popover = null; };

  const fillModeMenu = menu => {
    const current = themeMode(app);
    for (const [mode, title, icon] of [["light", "浅色", "lucide-sun"], ["dark", "深色", "lucide-moon"], ["system", "跟随系统", "lucide-sun-moon"]]) {
      menu.addItem(item => item.setTitle(title).setIcon(icon).setChecked(current === mode).onClick(() => {
        setThemeMode(app, mode);
        refresh();
      }));
    }
  };
  const openModeMenu = event => {
    const menu = new Menu();
    fillModeMenu(menu);
    menu.showAtMouseEvent(event);
  };

  const fillThemeMenu = menu => {
    menu.addItem(item => {
      item.setTitle("明暗模式").setIcon(modeIcon());
      fillModeMenu(item.setSubmenu());
    });
    menu.addItem(item => {
      item.setTitle("主题配色").setIcon("lucide-palette");
      const colors = item.setSubmenu();
      for (const preset of ACCENT_PRESETS) colors.addItem(choice => choice.setTitle(preset.label).setIcon("lucide-palette")
        .setChecked(currentAccent(plugin) === preset.value).onClick(() => applyAccent(plugin, preset.value)));
    });
  };
  const openThemeMenu = event => {
    closePopover();
    const menu = new Menu();
    fillThemeMenu(menu);
    if (event) menu.showAtMouseEvent(event);
    else menu.showAtPosition({ x: Math.round(window.innerWidth / 2), y: 80 });
  };

  const openAccentPopover = anchor => {
    if (popover) return closePopover();
    const current = currentAccent(plugin);
    popover = document.body.createDiv({ cls: "ibm-accent-popover" });
    popover.createDiv({ cls: "ibm-accent-popover-title", text: "完整主题预设" });
    const grid = popover.createDiv({ cls: "ibm-accent-grid" });
    for (const preset of ACCENT_PRESETS) {
      const swatch = grid.createEl("button", { cls: "ibm-accent-swatch", attr: { "aria-label": preset.label, "data-tooltip-position": "top" } });
      swatch.style.setProperty("--swatch", preset.color);
      swatch.toggleClass("is-active", preset.value === current);
      swatch.addEventListener("click", () => {
        applyAccent(plugin, preset.value);
        closePopover();
      });
    }
    const custom = grid.createEl("button", { cls: "ibm-accent-swatch is-custom", attr: { "aria-label": "自定义颜色", "data-tooltip-position": "top" } });
    if (plugin.state.customAccent) custom.style.setProperty("--swatch", plugin.state.customAccent);
    custom.toggleClass("is-active", current === CUSTOM_ACCENT);
    const picker = popover.createEl("input", { cls: "ibm-accent-picker", attr: { type: "color" } });
    picker.value = (plugin.state.customAccent || "#4D81EF").toLowerCase();
    // Live preview while dragging; commit on change.
    picker.addEventListener("input", () => {
      writeCustomPalette(picker.value.toUpperCase(), selectedPresetId(plugin));
      document.body.classList.add(CUSTOM_ACCENT);
      custom.style.setProperty("--swatch", picker.value);
    });
    picker.addEventListener("change", () => {
      plugin.state.customAccent = picker.value.toUpperCase();
      writeCustomPalette(plugin.state.customAccent, selectedPresetId(plugin));
      applyAccent(plugin, CUSTOM_ACCENT);
      closePopover();
    });
    custom.addEventListener("click", () => picker.click());
    const box = anchor.getBoundingClientRect();
    popover.style.left = `${Math.round(box.left)}px`;
    popover.style.bottom = `${Math.round(window.innerHeight - box.top + 8)}px`;
    window.setTimeout(() => {
      const outside = event => {
        if (!popover || popover.contains(event.target) || anchor.contains(event.target)) return;
        closePopover();
      };
      plugin.registerDomEvent(document, "mousedown", outside);
    });
  };

  const buttons = [];
  const mount = () => {
    if (Platform.isMobile) return;
    for (const actions of document.querySelectorAll(".workspace-drawer-vault-actions")) {
      if (actions.querySelector(".ibm-appearance-button")) continue;
      const modeButton = createSpan({ cls: "clickable-icon ibm-appearance-button", attr: { "aria-label": "明暗模式" } });
      modeButton.addEventListener("click", openModeMenu);
      const accentButton = createSpan({ cls: "clickable-icon ibm-appearance-button ibm-accent-button", attr: { "aria-label": "完整主题预设" } });
      setIcon(accentButton, "lucide-palette");
      accentButton.addEventListener("click", () => openAccentPopover(accentButton));
      actions.prepend(modeButton, accentButton);
      buttons.push(modeButton, accentButton);
    }
    refresh();
  };
  const refresh = () => {
    for (const button of buttons) {
      if (!button.hasClass("ibm-accent-button")) setIcon(button, modeIcon());
    }
  };

  plugin.addCommand({ id: "theme-and-palette", name: "主题明暗与配色", icon: "lucide-palette", callback: () => openThemeMenu(null) });
  if (Platform.isMobile) {
    const ribbon = plugin.addRibbonIcon("lucide-palette", "主题明暗与配色", openThemeMenu);
    ribbon.addClass("ibm-mobile-theme-button");
    plugin.registerEvent(app.workspace.on("file-menu", (menu, file, source) => {
      if (source !== "more-options") return;
      menu.addItem(item => {
        item.setTitle("主题明暗与配色").setIcon("lucide-palette").setSection("pane");
        fillThemeMenu(item.setSubmenu());
      });
    }));
  }
  mount();
  // Obsidian can create the vault profile after onLayoutReady has already
  // fired (notably during startup/restore). Keep watching until its action
  // container exists so the appearance controls are not silently omitted.
  const observer = new MutationObserver(() => {
    const missingControls = [...document.querySelectorAll(".workspace-drawer-vault-actions")]
      .some(actions => !actions.querySelector(".ibm-appearance-button"));
    if (missingControls) mount();
  });
  if (!Platform.isMobile) observer.observe(document.body, { childList: true, subtree: true });
  plugin.registerEvent(app.workspace.on("layout-change", mount));
  plugin.registerEvent(app.workspace.on("css-change", () => { applyAppearancePreferences(plugin); refresh(); }));
  plugin.register(() => {
    observer.disconnect();
    closePopover();
    for (const button of buttons) button.remove();
    clearAppearancePreferences();
  });
}

/* --------------------------------------------------------------------------
 * Architecture icons
 *
 * architecture-beta ships five icons (cloud, database, disk, internet,
 * server); any other name draws a "?". Lucide (@iconify-json/lucide, ISC) is
 * registered as the "ibm-lucide" pack, each glyph set on the same 80×80 tile
 * the built-ins use so the theme's tile styling applies. Unknown prefix-less
 * names are then rewritten to Lucide: common service words through ALIASES,
 * anything else if Lucide has an icon of that name.
 * -------------------------------------------------------------------------- */


export {
  ACCENT_PRESETS,
  CUSTOM_ACCENT,
  writeCustomPalette,
  appearanceDefaults,
  tabDefaults,
  currentAccent,
  applyAppearancePreferences,
  clearAppearancePreferences,
  applyAccent,
  addDropdownSetting,
  themeMode,
  setThemeMode,
  installAppearanceControls
};
