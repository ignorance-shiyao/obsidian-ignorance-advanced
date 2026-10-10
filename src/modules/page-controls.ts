import { setIcon } from "./ui-icons.js";
import { toggleWritingMode } from "./editor-tools.js";
import { openPresentation } from "./slides.js";
import { PAPERS, MARGIN_PRESETS, paperSize, paperMarginsForPreset } from "./paper.js";
import { HEADING_FONT_OPTIONS } from "./fonts.js";
import { applyAppearancePreferences } from "./appearance.js";
const { Menu } = require("obsidian");

let refreshReadingPages = () => {};

export function setPageRefreshHandler(handler) {
  refreshReadingPages = typeof handler === "function" ? handler : () => {};
}

const MM = 96 / 25.4;
// Full width is Obsidian's own "Readable line length" switched off; these
// presets are the width used while it is on.
const WIDTH_PRESETS = [["narrow", "窄", 680], ["standard", "标准", 820], ["wide", "宽", 1080]];
const PAGE_GAP = 24;

function pageDefaults() {
  return {
    width: "standard", customWidth: 900, paged: false,
    paper: "A4", customPaper: { w: 210, h: 297 }, landscape: false,
    marginPreset: "normal", margins: { ...MARGIN_PRESETS.normal },
    pageNumber: "center", pageNumberFormat: "plain", runningHeader: "none", breakMode: "whitespace"
  };
}

function applyPageSettings(plugin) {
  const page = plugin.state.page;
  const body = document.body;
  // Text size is Obsidian's own (Appearance → font size, Ctrl + scroll);
  // pages are drawn at their real size.
  const scale = 1;
  const width = page.width === "custom" ? page.customWidth : (WIDTH_PRESETS.find(([id]) => id === page.width)?.[2] ?? 820);
  // The theme reads --ib-content-max (and Obsidian --file-line-width).
  body.style.setProperty("--ib-content-max", `${Math.round(width * scale)}px`);
  body.style.setProperty("--file-line-width", `${Math.round(width * scale)}px`);
  body.classList.toggle("ibp-paged", page.paged);
  const size = paperSize(page);
  const m = page.margins;
  const px = mm => `${(mm * MM * scale).toFixed(2)}px`;
  body.style.setProperty("--ibp-page-w", px(size.w));
  body.style.setProperty("--ibp-page-h", px(size.h));
  body.style.setProperty("--ibp-page-gap", `${PAGE_GAP}px`);
  body.style.setProperty("--ibp-mt", px(m.t));
  body.style.setProperty("--ibp-mr", px(m.r));
  body.style.setProperty("--ibp-mb", px(m.b));
  body.style.setProperty("--ibp-ml", px(m.l));
  // Print / native PDF export use the same sheet.
  let style = document.getElementById("ibp-print-page");
  if (!style) style = document.head.createEl("style", { attr: { id: "ibp-print-page" } });
  style.textContent = page.paged ? `@media print { @page { size: ${size.w}mm ${size.h}mm; margin: ${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm; } }` : "";
  for (const toolbar of document.querySelectorAll(".ibp-toolbar")) toolbar.dispatchEvent(new CustomEvent("ibp-refresh"));
  refreshPageNumbers(plugin);
  refreshReadingPages(plugin, true);
  window.dispatchEvent(new CustomEvent("ibp-page-change"));
}

/* Editing always shows one continuous sheet; only paged reading and export
   are cut into pages. Remove sheet layers left by older versions. */
function refreshPageNumbers(plugin) {
  for (const sizer of document.querySelectorAll(".markdown-source-view.mod-cm6 .cm-sizer, .markdown-preview-view .markdown-preview-sizer")) {
    sizer.querySelector(":scope > .ibp-sheets")?.remove();
  }
}

/* Page settings (paper, margins…) for this device, and the sheet variables
   derived from them. Exports need them too, so this also runs on phones,
   which get no title-row toolbar. */
export function initPageState(plugin) {
  if (plugin.pageStateReady) return;
  plugin.pageStateReady = true;
  // Page layout is per device: data.json syncs with the vault, and a paged A4
  // layout chosen on a desktop must not follow the vault onto a phone.
  const local = plugin.app.loadLocalStorage?.("ibp-page");
  plugin.state.page = Object.assign(pageDefaults(), local || plugin.state.page || {});
  plugin.state.page.margins = Object.assign({ ...MARGIN_PRESETS.normal }, plugin.state.page.margins || {});
  delete plugin.state.page.zoom;
  // The old "full width" preset is now Obsidian's readable-line-length switch.
  if (plugin.state.page.width === "full") {
    plugin.state.page.width = "standard";
    plugin.app.vault.setConfig?.("readableLineLength", false);
  }
  if (plugin.state.page.marginPreset !== "custom") {
    plugin.state.page.margins = paperMarginsForPreset(plugin.state.page.marginPreset, plugin.state.page.paper) || plugin.state.page.margins;
  }
  applyPageSettings(plugin);
}

function installPageControls(plugin, showExportMenu) {
  initPageState(plugin);
  const save = () => { applyPageSettings(plugin); plugin.app.saveLocalStorage?.("ibp-page", plugin.state.page); };
  save();
  const page = () => plugin.state.page;
  let popover = null;
  const closePopover = () => { popover?.remove(); popover = null; };

  const openWidthMenu = event => {
    const menu = new Menu();
    for (const [id, label, px] of WIDTH_PRESETS) {
      menu.addItem(item => item.setTitle(px ? `${label}（${px}px）` : label).setChecked(page().width === id).onClick(() => { page().width = id; save(); }));
    }
    menu.addItem(item => item.setTitle(`自定义…${page().width === "custom" ? `（${page().customWidth}px）` : ""}`).setChecked(page().width === "custom").onClick(() => openWidthInput(event)));
    menu.showAtMouseEvent(event);
  };

  const openWidthInput = event => {
    closePopover();
    popover = document.body.createDiv({ cls: "ibp-popover" });
    const row = popover.createDiv({ cls: "ibp-row" });
    row.createSpan({ text: "正文宽度" });
    const input = row.createEl("input", { attr: { type: "number", min: "400", max: "2400", step: "20" } });
    input.value = String(page().customWidth);
    row.createSpan({ cls: "ibp-unit", text: "px" });
    const commit = () => { const v = Math.min(2400, Math.max(400, Number(input.value) || 900)); page().width = "custom"; page().customWidth = v; save(); closePopover(); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") commit(); if (e.key === "Escape") closePopover(); });
    popover.createEl("button", { cls: "mod-cta", text: "应用" }).addEventListener("click", commit);
    placePopover(event.target instanceof Element ? event.target : document.body);
    input.focus();
  };

  const placePopover = anchor => {
    const box = anchor.getBoundingClientRect();
    popover.style.top = `${Math.round(box.bottom + 6)}px`;
    popover.style.left = `${Math.round(Math.min(box.left, window.innerWidth - popover.offsetWidth - 12))}px`;
    window.setTimeout(() => plugin.registerDomEvent(document, "mousedown", event => {
      if (popover && !popover.contains(event.target) && !anchor.contains(event.target)) closePopover();
    }));
  };

  const numberField = (parent, label, value, onChange, unit = "mm") => {
    const field = parent.createDiv({ cls: "ibp-field" });
    field.createSpan({ text: label });
    const input = field.createEl("input", { attr: { type: "number", step: "0.1", min: "0" } });
    input.value = String(value);
    input.addEventListener("change", () => onChange(Math.max(0, Number(input.value) || 0)));
    field.createSpan({ cls: "ibp-unit", text: unit });
    return input;
  };

  const openPageSettings = anchor => {
    closePopover();
    const p = page();
    const menu = new Menu();
    const submenu = (parent, label, icon, fill) => parent.addItem(item => {
      item.setTitle(label).setIcon(icon);
      fill(item.setSubmenu());
    });
    const choice = (parent, label, checked, action) => parent.addItem(item =>
      item.setTitle(label).setChecked(checked).onClick(action));
    const customFields = (title, fields) => {
      closePopover();
      popover = document.body.createDiv({ cls: "ibp-popover" });
      popover.createDiv({ cls: "ibp-title", text: title });
      const grid = popover.createDiv({ cls: "ibp-grid" });
      for (const [label, value, change] of fields) numberField(grid, label, value, change);
      popover.createEl("button", { text: "完成", cls: "mod-cta" }).addEventListener("click", closePopover);
      placePopover(anchor);
    };
    submenu(menu, "字体", "type", fonts => {
      submenu(fonts, "标题字体", "heading", heading => {
        for (const [value, label] of HEADING_FONT_OPTIONS) choice(heading, label, plugin.state.appearance.fontHeading === value, () => {
          plugin.state.appearance.fontHeading = value;
          applyAppearancePreferences(plugin);
          plugin.app.workspace.trigger("css-change");
          plugin.saveStoredState();
        });
      });
      fonts.addItem(item => item.setTitle("正文、界面与代码字体…").setIcon("settings").onClick(() => {
        plugin.app.setting.open();
        plugin.app.setting.openTabById("appearance");
      }));
    });
    submenu(menu, "阅读布局", "book-open", layout => {
      for (const [value, label] of [[false, "连续阅读（与实时预览一致）"], [true, "分页阅读（纸张布局）"]]) choice(layout, label, p.paged === value, () => { p.paged = value; save(); });
    });
    submenu(menu, "纸张", "file", papers => {
      for (const [id, paper] of Object.entries(PAPERS)) choice(papers, paper.label, p.paper === id, () => {
        p.paper = id;
        if (paper.margins) { p.marginPreset = "gov"; p.margins = paperMarginsForPreset("gov", id); }
        else if (p.marginPreset !== "custom") p.margins = paperMarginsForPreset(p.marginPreset, id) || p.margins;
        save();
      });
      choice(papers, "自定义尺寸…", p.paper === "CUSTOM", () => { p.paper = "CUSTOM"; save(); customFields("自定义纸张（mm）", [
        ["宽", p.customPaper.w, value => { p.paper = "CUSTOM"; p.customPaper.w = value || 210; save(); }],
        ["高", p.customPaper.h, value => { p.paper = "CUSTOM"; p.customPaper.h = value || 297; save(); }]
      ]); });
      papers.addSeparator();
      submenu(papers, "方向", "rotate-cw", direction => {
        for (const [value, label] of [[false, "纵向"], [true, "横向"]]) choice(direction, label, p.landscape === value, () => { p.landscape = value; save(); });
      });
    });
    submenu(menu, "页边距", "scan", margins => {
      for (const [id, preset] of Object.entries(MARGIN_PRESETS)) choice(margins, preset.label, p.marginPreset === id, () => {
        p.marginPreset = id;
        p.margins = paperMarginsForPreset(id, p.paper) || { t: preset.t, r: preset.r, b: preset.b, l: preset.l };
        save();
      });
      choice(margins, "自定义页边距…", p.marginPreset === "custom", () => customFields("自定义页边距（mm）",
        [["t", "上"], ["b", "下"], ["l", "左"], ["r", "右"]].map(([key, label]) =>
          [label, p.margins[key], value => { p.marginPreset = "custom"; p.margins[key] = value; save(); }])));
    });
    submenu(menu, "跨页方式", "split", breaks => {
      for (const [id, label] of [["whitespace", "留白：整块移到下一页"], ["cut", "截断：在页底切开续排"]]) choice(breaks, label, p.breakMode === id, () => { p.breakMode = id; save(); });
    });
    submenu(menu, "页码", "list-ordered", numbers => {
      submenu(numbers, "位置", "align-center", position => {
        for (const [id, label] of [["none", "不显示"], ["center", "底部居中"], ["right", "底部右侧"]]) choice(position, label, p.pageNumber === id, () => { p.pageNumber = id; save(); });
      });
      submenu(numbers, "格式", "hash", format => {
        for (const [id, label] of [["plain", "1"], ["total", "1 / 5"], ["gov", "- 1 -"], ["zh", "第 1 页"]]) choice(format, label, p.pageNumberFormat === id, () => { p.pageNumberFormat = id; save(); });
      });
    });
    submenu(menu, "页眉", "panel-top", headers => {
      for (const [id, label] of [["none", "不显示"], ["chapter", "章节名"]]) choice(headers, label, (p.runningHeader || "none") === id, () => { p.runningHeader = id; save(); });
    });
    const box = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: box.left, y: box.bottom + 6 });
  };

  const buildToolbar = view => {
    const host = view.containerEl;
    if (host.querySelector(".ibp-toolbar")) return;
    const bar = createDiv({ cls: "ibp-toolbar" });
    const button = (icon, label, onClick) => {
      const el = bar.createDiv({ cls: "clickable-icon ibp-button", attr: { "aria-label": label } });
      setIcon(el, icon);
      el.addEventListener("click", onClick);
      return el;
    };
    const width = bar.createDiv({ cls: "clickable-icon ibp-button ibp-text-button", attr: { "aria-label": "正文宽度" } });
    width.addEventListener("click", openWidthMenu);
    bar.createDiv({ cls: "ibp-sep" });
    const settings = button("lucide-file-cog", "页面设置", () => openPageSettings(settings));
    bar.createDiv({ cls: "ibp-sep" });
    const typewriter = button("lucide-align-center", "打字机滚动", () => toggleWritingMode(plugin, "typewriterScroll"));
    const focus = button("lucide-eye-off", "专注模式", () => toggleWritingMode(plugin, "focusMode"));
    typewriter.addClass("ibp-edit-only");
    focus.addClass("ibp-edit-only");
    bar.createDiv({ cls: "ibp-sep ibp-edit-only" });
    // Both icons are present; the theme shows the one for the other mode from
    // the leaf's data-mode, so ⌘E and other mode switches keep it correct.
    const modeButton = bar.createDiv({ cls: "clickable-icon ibp-button ibp-mode-toggle", attr: { "aria-label": "切换阅读 / 编辑" } });
    setIcon(modeButton.createSpan({ cls: "ibp-mode-to-reading" }), "lucide-book-open");
    setIcon(modeButton.createSpan({ cls: "ibp-mode-to-editing" }), "lucide-pencil");
    modeButton.addEventListener("click", () => {
      const state = view.getState();
      state.mode = view.getMode?.() === "preview" ? "source" : "preview";
      void view.setState(state, { history: false });
    });
    bar.createDiv({ cls: "ibp-sep" });
    button("lucide-presentation", "演示", () => openPresentation(plugin, view.file, view.leaf));
    const exportButton = button("lucide-share", "导出", event => showExportMenu(plugin, view, event));
    bar.createDiv({ cls: "ibp-sep" });
    button("lucide-columns-2", "左右分屏", () => { if (view.file) void plugin.app.workspace.getLeaf("split", "vertical").openFile(view.file); });
    button("lucide-rows-2", "上下分屏", () => { if (view.file) void plugin.app.workspace.getLeaf("split", "horizontal").openFile(view.file); });
    const refresh = () => {
      const p = page();
      const preset = WIDTH_PRESETS.find(([id]) => id === p.width);
      width.setText(p.width === "custom" ? `宽 ${p.customWidth}` : `宽度 · ${preset ? preset[1] : "标准"}`);
      typewriter.toggleClass("is-active", Boolean(plugin.state.writingModes?.typewriterScroll));
      typewriter.setAttr("aria-pressed", String(Boolean(plugin.state.writingModes?.typewriterScroll)));
      focus.toggleClass("is-active", Boolean(plugin.state.writingModes?.focusMode));
      focus.setAttr("aria-pressed", String(Boolean(plugin.state.writingModes?.focusMode)));
      const size = paperSize(p);
      const name = p.paper === "CUSTOM" ? `${size.w}×${size.h}` : PAPERS[p.paper]?.label.replace(/（.*）/, "") || "A4";
      settings.setAttr("aria-label", `页面设置（${name}${p.landscape ? " 横向" : ""}）`);
    };
    bar.addEventListener("ibp-refresh", refresh);
    refresh();
    // One row: the bar sits in the view header between the note path and "⋯".
    const actions = host.querySelector(":scope > .view-header > .view-actions");
    if (actions) actions.before(bar);
    else host.insertBefore(bar, host.querySelector(":scope > .view-content"));
    host.addClass("ibp-toolbar-host");
    syncWidthFlags();
  };

  // The width button is inert while the editor is not using the readable line width; the theme dims it through this flag.
  const syncWidthFlags = () => document.querySelectorAll<HTMLElement>('.workspace-leaf-content[data-type="markdown"]').forEach(leaf =>
    leaf.toggleClass("ibp-source-fixed-width", Boolean(leaf.querySelector(".markdown-source-view.mod-cm6:not(.is-readable-line-width)"))));
  const sweep = () => {
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) buildToolbar(leaf.view);
    syncWidthFlags();
    refreshPageNumbers(plugin);
  };
  sweep();
  applyPageSettings(plugin);
  plugin.registerEvent(plugin.app.workspace.on("layout-change", sweep));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", sweep));
  // Opening a file can swap a leaf's view (e.g. an empty tab becomes a note)
  // without a layout-change, so the toolbar is checked here too.
  plugin.registerEvent(plugin.app.workspace.on("file-open", () => window.setTimeout(() => { sweep(); refreshReadingPages(plugin); }, 50)));
  let modifyTimer = 0;
  plugin.registerEvent(plugin.app.vault.on("modify", () => {
    window.clearTimeout(modifyTimer);
    modifyTimer = window.setTimeout(() => refreshReadingPages(plugin), 800);
  }));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", () => refreshReadingPages(plugin)));
  // Switching a view between editing and reading swaps its sizer without any
  // workspace event; catch new sizers as they are inserted.
  let pending = 0;
  const sizerWatcher = new MutationObserver(mutations => {
    if (mutations.some(m => m.type === "attributes" && m.target instanceof Element && m.target.matches(".markdown-source-view"))) syncWidthFlags();
    if (!plugin.state.page.paged || pending) return;
    const found = mutations.some(m => m.type === "attributes"
      ? m.target instanceof Element && m.target.matches(".markdown-source-view, .markdown-reading-view")
      : [...m.addedNodes].some(n => n instanceof Element && (n.matches(".cm-sizer, .markdown-preview-sizer, .markdown-source-view, .markdown-reading-view") || n.querySelector?.(".cm-sizer, .markdown-preview-sizer"))));
    if (!found) return;
    pending = window.setTimeout(() => { pending = 0; refreshPageNumbers(plugin); refreshReadingPages(plugin); }, 150);
  });
  sizerWatcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  plugin.register(() => sizerWatcher.disconnect());
  // Appearance font size changes re-derive the zoomed size.
  plugin.registerEvent(plugin.app.workspace.on("css-change", () => applyPageSettings(plugin)));
  plugin.register(() => {
    closePopover();
    document.querySelectorAll(".ibp-toolbar, .ibp-book, .ibp-staging").forEach(el => el.remove());
    document.querySelectorAll(".ibp-has-book").forEach(el => el.removeClass("ibp-has-book"));
    document.querySelectorAll(".ibp-book-host, .ibp-toolbar-host, .ibp-source-fixed-width").forEach(el => el.removeClasses(["ibp-book-host", "ibp-toolbar-host", "ibp-source-fixed-width"]));
    document.getElementById("ibp-print-page")?.remove();
    document.body.classList.remove("ibp-paged");
    for (const name of ["--ibp-scale", "--ibp-font-size", "--ib-content-max", "--file-line-width", "--ibp-page-w", "--ibp-page-h", "--ibp-page-gap", "--ibp-mt", "--ibp-mr", "--ibp-mb", "--ibp-ml"]) document.body.style.removeProperty(name);
  });
}

/* --------------------------------------------------------------------------
 * Paged reading view ("book")
 *
 * Obsidian's reading view only renders the sections near the viewport, so
 * page breaks cannot be computed on it. When paging is on, a reading view
 * gets its own full render of the note (MarkdownRenderer, so Mermaid, callouts
 * and embeds render as usual) in an off-screen staging strip at the page's
 * text width. The strip is then cut into pages: each page shows the top-level
 * blocks that fall in its window, positioned as they were in the strip and
 * clipped to the page body. Where a window ends is the break mode:
 *   cut        – at the page bottom, snapped back to the nearest line, table
 *                row or list item boundary so no line is sliced;
 *   whitespace – before the block that would cross the page bottom (it moves
 *                to the next page whole), unless it is taller than a page;
 *                a heading left at the bottom moves down with it.
 * Export (PDF / images) reuses the same pages.
 * -------------------------------------------------------------------------- */


export {
  MM,
  PAPERS,
  MARGIN_PRESETS,
  paperMarginsForPreset,
  WIDTH_PRESETS,
  PAGE_GAP,
  pageDefaults,
  paperSize,
  applyPageSettings,
  refreshPageNumbers,
  installPageControls
};
