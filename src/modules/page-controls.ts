import type { IgnorancePlugin, PageState } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { MarkdownView, Menu, Platform } from "obsidian";
import type { TFile } from "obsidian";
import { setDocSheet, removeDocSheet } from "./doc-sheets.js";
import { setIcon } from "./ui-icons.js";
import { toggleWritingMode } from "./editor-tools.js";
import { openPresentation } from "./slides.js";
import { PAPERS, MARGIN_PRESETS, paperSize, paperMarginsForPreset } from "./paper.js";
import { PAGE_PRESETS, applyPagePreset } from "./page-presets.js";
import { addLayoutItems } from "./layout-library.js";
import { FOOTER_CHOICES, promptFooter } from "./page-footer.js";
import { HEADING_FONT_OPTIONS } from "./fonts.js";
import { applyAppearancePreferences } from "./appearance.js";

type PageRefreshHandler = (plugin: IgnorancePlugin, force?: boolean) => void;
let refreshReadingPages: PageRefreshHandler = () => {};

export function setPageRefreshHandler(handler: PageRefreshHandler) {
  refreshReadingPages = typeof handler === "function" ? handler : () => {};
}

const MM = 96 / 25.4;
// Full width is Obsidian's own "Readable line length" switched off; these
// presets are the share of the window the page takes while it is on.
// Each preset also has a line-length cap in pixels: on a wide monitor a bare share gives lines too long to read.
const MARGIN_KEYS: [keyof PageState["margins"], string][] = [["t", "上"], ["b", "下"], ["l", "左"], ["r", "右"]];
const WIDTH_PRESETS: [string, string, number, number][] = [["narrow", "窄", 62, 800], ["standard", "标准", 84, 1100], ["wide", "宽", 95, 1400]];
const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
const PAGE_GAP = 24;

function pageDefaults(): PageState {
  return {
    width: "standard", customWidth: 80, zoom: 1, paged: false,
    paper: "A4", customPaper: { w: 210, h: 297 }, landscape: false,
    marginPreset: "normal", margins: { ...MARGIN_PRESETS.normal },
    pageNumber: "center", pageNumberFormat: "plain", runningHeader: "none", footerText: "", breakMode: "whitespace"
  };
}

// A cssclasses value as a list (the property may be a string or a list).
function classList(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,]+/) : [];
  return items.map(item => String(item as string)).filter(Boolean);
}

// The note's cssclasses as a list.
function noteClasses(plugin: IgnorancePlugin, file: TFile): string[] {
  return classList(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.cssclasses);
}

async function setNoteWidthClass(plugin: IgnorancePlugin, file: TFile, cls: string) {
  await plugin.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
    const list = classList(frontmatter.cssclasses).filter(name => name !== "ib-wide" && name !== "ib-narrow");
    if (cls) list.push(cls);
    if (list.length) frontmatter.cssclasses = list;
    else delete frontmatter.cssclasses;
  });
}

// The sizer of whichever mode the view is showing (reading and editing each keep their own).
function visibleSizer(host: HTMLElement): HTMLElement | null {
  for (const sizer of host.querySelectorAll<HTMLElement>(".markdown-reading-view .markdown-preview-sizer, .markdown-source-view.mod-cm6 .cm-sizer")) {
    if (sizer.offsetParent) return sizer;
  }
  return null;
}

/** Apply the page settings and remember them on this device; also used by the layout commands. */
export function savePageSettings(plugin: IgnorancePlugin) {
  applyPageSettings(plugin);
  plugin.app.saveLocalStorage?.("ibp-page", plugin.state.page);
}

function applyPageSettings(plugin: IgnorancePlugin) {
  const page = plugin.state.page;
  const body = document.body;
  // The page width is a share of the window. Zoom (Ctrl + wheel) magnifies the
  // whole page like a picture: the layout inside it is the same at every level,
  // it just gets bigger or smaller, and a page larger than the window scrolls.
  // A phone is too narrow to give any of its width away, and pinching already zooms.
  const phone = Platform.isPhone;
  const preset = WIDTH_PRESETS.find(([id]) => id === page.width) ?? WIDTH_PRESETS[1];
  const share = phone ? 100 : page.width === "custom" ? page.customWidth : preset[2];
  // A custom width is an explicit share and is not capped.
  const cap = phone || page.width === "custom" ? 100000 : preset[3];
  const zoom = phone ? 1 : Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(page.zoom) || 1));
  body.style.setProperty("--ib-content-max", `${share}%`);
  // Obsidian caps embeds (images, tables) at --file-line-width inside the page, so it must not be the share again.
  body.setCssProps({ "--ibp-zoom": String(zoom), "--ibp-share": String(share / 100), "--ibp-cap": `${cap}px`, "--file-line-width": "100%" });
  const scale = 1;
  body.classList.toggle("ibp-paged", page.paged);
  const size = paperSize(page);
  const m = page.margins;
  const px = (mm: number) => `${(mm * MM * scale).toFixed(2)}px`;
  body.style.setProperty("--ibp-page-w", px(size.w));
  body.style.setProperty("--ibp-page-h", px(size.h));
  body.style.setProperty("--ibp-page-gap", `${PAGE_GAP}px`);
  body.style.setProperty("--ibp-mt", px(m.t));
  body.style.setProperty("--ibp-mr", px(m.r));
  body.style.setProperty("--ibp-mb", px(m.b));
  body.style.setProperty("--ibp-ml", px(m.l));
  // Print / native PDF export use the same sheet.
  setDocSheet("ibp-print-page", page.paged ? `@media print { @page { size: ${size.w}mm ${size.h}mm; margin: ${m.t}mm ${m.r}mm ${m.b}mm ${m.l}mm; } }` : "");
  for (const toolbar of document.querySelectorAll(".ibp-toolbar")) toolbar.dispatchEvent(new CustomEvent("ibp-refresh"));
  refreshPageNumbers(plugin);
  refreshReadingPages(plugin, true);
  window.dispatchEvent(new CustomEvent("ibp-page-change"));
}

/* Editing always shows one continuous sheet; only paged reading and export
   are cut into pages. Remove sheet layers left by older versions. */
function refreshPageNumbers(plugin: IgnorancePlugin) {
  for (const sizer of document.querySelectorAll(".markdown-source-view.mod-cm6 .cm-sizer, .markdown-preview-view .markdown-preview-sizer")) {
    sizer.querySelector(":scope > .ibp-sheets")?.remove();
  }
}

/* Page settings (paper, margins…) for this device, and the sheet variables
   derived from them. Exports need them too, so this also runs on phones,
   which get no title-row toolbar. */
export function initPageState(plugin: IgnorancePlugin) {
  if (plugin.pageStateReady) return;
  plugin.pageStateReady = true;
  // Page layout is per device: data.json syncs with the vault, and a paged A4
  // layout chosen on a desktop must not follow the vault onto a phone.
  const local = plugin.app.loadLocalStorage("ibp-page") as Partial<PageState> | null;
  plugin.state.page = Object.assign(pageDefaults(), local || plugin.state.page || {});
  plugin.state.page.margins = Object.assign({ ...MARGIN_PRESETS.normal }, plugin.state.page.margins || {});
  // Widths used to be pixels; a custom width above 100 is one of those.
  if (!(plugin.state.page.customWidth >= 30 && plugin.state.page.customWidth <= 100)) plugin.state.page.customWidth = 80;
  // Zoom is a saved preview scale: the page is laid out at its width setting, then magnified as a whole.
  plugin.state.page.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(plugin.state.page.zoom) || 1));
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

function installPageControls(plugin: IgnorancePlugin, showExportMenu: (plugin: IgnorancePlugin, view: MarkdownView, event: MouseEvent) => void) {
  initPageState(plugin);
  const save = () => { applyPageSettings(plugin); plugin.app.saveLocalStorage?.("ibp-page", plugin.state.page); };
  save();
  const page = () => plugin.state.page;
  let popover: HTMLElement | null = null;
  const closePopover = () => { popover?.remove(); popover = null; };

  // Width: three named sizes for every note on this device; a note can keep its own (stored in its cssclasses).
  const addWidthItems = (menu: Menu, anchor: Element) => {
    const file = plugin.app.workspace.getActiveFile();
    const classes = file?.extension === "md" ? noteClasses(plugin, file) : [];
    const own = classes.includes("ib-wide") ? "ib-wide" : classes.includes("ib-narrow") ? "ib-narrow" : "";
    for (const [id, label] of WIDTH_PRESETS) {
      menu.addItem(item => item.setTitle(label).setChecked(!own && page().width === id).onClick(() => { page().width = id; save(); }));
    }
    menu.addItem(item => item.setTitle(page().width === "custom" ? `自定义 ${page().customWidth}%…` : "自定义…").setChecked(!own && page().width === "custom").onClick(() => openWidthInput(anchor)));
    if (!file || file.extension !== "md") return;
    menu.addSeparator();
    menu.addItem(item => {
      item.setTitle(own ? `本篇单独：${own === "ib-wide" ? "宽" : "窄"}` : "本篇单独设置");
      const single = item.setSubmenu();
      for (const [cls, label] of [["", "不单独设置"], ["ib-narrow", "窄"], ["ib-wide", "宽"]]) {
        single.addItem(option => option.setTitle(label).setChecked(own === cls).onClick(() => { if (own !== cls) void setNoteWidthClass(plugin, file, cls); }));
      }
    });
  };

  const openWidthInput = (anchor: Element) => {
    closePopover();
    popover = document.body.createDiv({ cls: "ibp-popover" });
    const row = popover.createDiv({ cls: "ibp-row" });
    row.createSpan({ text: tr("此设备默认宽度") });
    const input = row.createEl("input", { attr: { type: "number", min: "30", max: "100", step: "5" } });
    input.value = String(page().customWidth);
    row.createSpan({ cls: "ibp-unit", text: tr("% 视图宽度") });
    const commit = () => { const v = Math.min(100, Math.max(30, Number(input.value) || 80)); page().width = "custom"; page().customWidth = v; save(); closePopover(); };
    input.addEventListener("keydown", e => { if (e.key === "Enter") commit(); if (e.key === "Escape") closePopover(); });
    popover.createEl("button", { cls: "mod-cta", text: tr("应用") }).addEventListener("click", commit);
    placePopover(anchor);
    input.focus();
  };

  const placePopover = (anchor: Element) => {
    const box = anchor.getBoundingClientRect();
    popover.style.top = `${Math.round(box.bottom + 6)}px`;
    popover.style.left = `${Math.round(Math.min(box.left, window.innerWidth - popover.offsetWidth - 12))}px`;
    window.setTimeout(() => plugin.registerDomEvent(document, "mousedown", event => {
      const target = event.target as Node;
      if (popover && !popover.contains(target) && !anchor.contains(target)) closePopover();
    }));
  };

  const numberField = (parent: HTMLElement, label: string, value: number, onChange: (value: number) => void, unit = "mm") => {
    const field = parent.createDiv({ cls: "ibp-field" });
    field.createSpan({ text: label });
    const input = field.createEl("input", { attr: { type: "number", step: "0.1", min: "0" } });
    input.value = String(value);
    input.addEventListener("change", () => onChange(Math.max(0, Number(input.value) || 0)));
    field.createSpan({ cls: "ibp-unit", text: unit });
    return input;
  };

  const openPageSettings = (anchor: HTMLDivElement) => {
    closePopover();
    const p = page();
    const menu = new Menu();
    const submenu = (parent: Menu, label: string, icon: string, fill: (menu: Menu) => void) => parent.addItem(item => {
      item.setTitle(label).setIcon(icon);
      fill(item.setSubmenu());
    });
    const choice = (parent: Menu, label: string, checked: boolean, action: () => void) => parent.addItem(item =>
      item.setTitle(label).setChecked(checked).onClick(action));
    const customFields = (title: string, fields: [string, number, (value: number) => void][]) => {
      closePopover();
      popover = document.body.createDiv({ cls: "ibp-popover" });
      popover.createDiv({ cls: "ibp-title", text: title });
      const grid = popover.createDiv({ cls: "ibp-grid" });
      for (const [label, value, change] of fields) numberField(grid, label, value, change);
      popover.createEl("button", { text: tr("完成"), cls: "mod-cta" }).addEventListener("click", closePopover);
      placePopover(anchor);
    };
    submenu(menu, "宽度", "move-horizontal", widths => addWidthItems(widths, anchor));
    submenu(menu, "标题字体", "type", fonts => {
      for (const [value, label] of HEADING_FONT_OPTIONS) choice(fonts, label, plugin.state.appearance.fontHeading === value, () => {
        plugin.state.appearance.fontHeading = value;
        applyAppearancePreferences(plugin);
        plugin.app.workspace.trigger("css-change");
        plugin.saveStoredState();
      });
      fonts.addSeparator();
      fonts.addItem(item => item.setTitle(tr("正文与代码字体…")).onClick(() => {
        plugin.app.setting.open();
        plugin.app.setting.openTabById("appearance");
      }));
    });
    submenu(menu, "版式", "layout-template", (presets: Menu) => {
      for (const preset of PAGE_PRESETS) choice(presets, preset.label.split("：")[0], false, () => { applyPagePreset(p, preset.id); save(); });
      addLayoutItems(plugin, presets, save);
    });
    menu.addItem(item => item.setTitle(tr("分页阅读")).setIcon("book-open").setChecked(Boolean(p.paged)).onClick(() => { p.paged = !p.paged; save(); }));
    // Paper, margins and page furniture only matter for paged reading and export.
    submenu(menu, "纸张与打印", "printer", print => {
    submenu(print, "纸张", "file", papers => {
      for (const [id, paper] of Object.entries(PAPERS)) choice(papers, paper.label, p.paper === id, () => {
        p.paper = id;
        if ("margins" in paper) { p.marginPreset = "gov"; p.margins = paperMarginsForPreset("gov", id); }
        else if (p.marginPreset !== "custom") p.margins = paperMarginsForPreset(p.marginPreset, id) || p.margins;
        save();
      });
      choice(papers, "自定义尺寸…", p.paper === "CUSTOM", () => { p.paper = "CUSTOM"; save(); customFields("自定义纸张（mm）", [
        ["宽", p.customPaper.w, (value: number) => { p.paper = "CUSTOM"; p.customPaper.w = value || 210; save(); }],
        ["高", p.customPaper.h, (value: number) => { p.paper = "CUSTOM"; p.customPaper.h = value || 297; save(); }]
      ]); });
      papers.addSeparator();
      choice(papers, "横向", Boolean(p.landscape), () => { p.landscape = !p.landscape; save(); });
    });
    submenu(print, "页边距", "scan", (margins: Menu) => {
      for (const [id, preset] of Object.entries(MARGIN_PRESETS)) choice(margins, preset.label, p.marginPreset === id, () => {
        p.marginPreset = id;
        p.margins = paperMarginsForPreset(id, p.paper) || { t: preset.t, r: preset.r, b: preset.b, l: preset.l };
        save();
      });
      choice(margins, "自定义页边距…", p.marginPreset === "custom", () => customFields("自定义页边距（mm）",
        MARGIN_KEYS.map(([key, label]): [string, number, (value: number) => void] =>
          [label, p.margins[key], value => { p.marginPreset = "custom"; p.margins[key] = value; save(); }])));
    });
    submenu(print, "页码", "list-ordered", (numbers: Menu) => {
      for (const [id, label] of [["none", "不显示"], ["center", "底部居中"], ["right", "底部右侧"]]) choice(numbers, label, p.pageNumber === id, () => { p.pageNumber = id; save(); });
      numbers.addSeparator();
      for (const [id, label] of [["plain", "1"], ["total", "1 / 5"], ["gov", "- 1 -"], ["zh", "第 1 页"]]) choice(numbers, label, p.pageNumberFormat === id, () => { p.pageNumberFormat = id; save(); });
    });
    submenu(print, "页眉", "panel-top", (headers: Menu) => {
      for (const [id, label] of [["none", "不显示"], ["chapter", "章节名"]]) choice(headers, label, (p.runningHeader || "none") === id, () => { p.runningHeader = id; save(); });
    });
    submenu(print, "页脚", "panel-bottom", (footers: Menu) => {
      for (const [template, label] of FOOTER_CHOICES) choice(footers, label, (p.footerText || "") === template, () => { p.footerText = template; save(); });
      const custom = !FOOTER_CHOICES.some(([template]) => template === (p.footerText || ""));
      choice(footers, custom ? `自定义：${p.footerText}` : "自定义…", custom, () => promptFooter(plugin, p.footerText || "", value => { p.footerText = value.trim(); save(); }));
    });
    submenu(print, "内容跨页", "split", (breaks: Menu) => {
      for (const [id, label] of [["whitespace", "整块移到下一页"], ["cut", "在页底切开"]]) choice(breaks, label, p.breakMode === id, () => { p.breakMode = id; save(); });
    });
    });
    const box = anchor.getBoundingClientRect();
    menu.showAtPosition({ x: box.left, y: box.bottom + 6 });
  };

  const buildToolbar = (view: MarkdownView) => {
    const host = view.containerEl;
    if (host.querySelector(".ibp-toolbar")) return;
    const bar = createDiv({ cls: "ibp-toolbar" });
    const button = (icon: string, label: string, onClick: (event: MouseEvent) => void) => {
      const el = bar.createDiv({ cls: "clickable-icon ibp-button", attr: { "aria-label": label } });
      setIcon(el, icon);
      el.addEventListener("click", onClick);
      return el;
    };
    // One entry for the page: the label shows the laid-out width, the menu holds width, paper and the rest.
    const width = bar.createDiv({ cls: "clickable-icon ibp-button ibp-text-button", attr: { "aria-label": tr("页面设置") } });
    setIcon(width.createSpan({ cls: "ibp-text-button-icon" }), "lucide-file-cog");
    const widthText = width.createSpan({ cls: "ibp-text-button-label" });
    width.addEventListener("click", () => openPageSettings(width));
    bar.createDiv({ cls: "ibp-sep" });
    const typewriter = button("lucide-align-center", "打字机滚动", () => toggleWritingMode(plugin, "typewriterScroll"));
    const focus = button("lucide-eye-off", "专注模式", () => toggleWritingMode(plugin, "focusMode"));
    typewriter.addClass("ibp-edit-only");
    focus.addClass("ibp-edit-only");
    bar.createDiv({ cls: "ibp-sep ibp-edit-only" });
    // Both icons are present; the theme shows the one for the other mode from
    // the leaf's data-mode, so ⌘E and other mode switches keep it correct.
    const modeButton = bar.createDiv({ cls: "clickable-icon ibp-button ibp-mode-toggle", attr: { "aria-label": tr("切换阅读 / 编辑") } });
    setIcon(modeButton.createSpan({ cls: "ibp-mode-to-reading" }), "lucide-book-open");
    setIcon(modeButton.createSpan({ cls: "ibp-mode-to-editing" }), "lucide-pencil");
    modeButton.addEventListener("click", () => {
      const state = view.getState();
      state.mode = view.getMode?.() === "preview" ? "source" : "preview";
      void view.setState(state, { history: false });
    });
    bar.createDiv({ cls: "ibp-sep" });
    button("lucide-presentation", "演示", () => { void openPresentation(plugin, view.file, view.leaf); });
    button("lucide-share", "导出", event => showExportMenu(plugin, view, event));
    bar.createDiv({ cls: "ibp-sep" });
    button("lucide-columns-2", "左右分屏", () => { if (view.file) void plugin.app.workspace.getLeaf("split", "vertical").openFile(view.file); });
    button("lucide-rows-2", "上下分屏", () => { if (view.file) void plugin.app.workspace.getLeaf("split", "horizontal").openFile(view.file); });
    const refresh = () => {
      const p = page();
      const preset = WIDTH_PRESETS.find(([id]) => id === p.width);
      // Show the width the page is laid out at (zoom only magnifies that layout).
      const sizer = visibleSizer(host);
      const px = sizer ? Math.round(parseFloat(getComputedStyle(sizer).width)) : 0;
      const own = view.file ? noteClasses(plugin, view.file) : [];
      const noteLabel = own.includes("ib-wide") ? "宽（本篇）" : own.includes("ib-narrow") ? "窄（本篇）" : "";
      const widthName = noteLabel || (p.width === "custom" ? `${p.customWidth}%` : preset ? preset[1] : "标准");
      widthText.setText(`${widthName}${px ? ` · ${px}px` : ""}${Number(p.zoom) && Number(p.zoom) !== 1 ? ` · ${Math.round(Number(p.zoom) * 100)}%` : ""}`);

      typewriter.toggleClass("is-active", Boolean(plugin.state.writingModes?.typewriterScroll));
      typewriter.setAttr("aria-pressed", String(Boolean(plugin.state.writingModes?.typewriterScroll)));
      focus.toggleClass("is-active", Boolean(plugin.state.writingModes?.focusMode));
      focus.setAttr("aria-pressed", String(Boolean(plugin.state.writingModes?.focusMode)));
      const size = paperSize(p);
      const name = p.paper === "CUSTOM" ? `${size.w}×${size.h}` : PAPERS[p.paper as keyof typeof PAPERS]?.label.replace(/（.*）/, "") || "A4";
      width.setAttr("aria-label", `页面设置（${name}${p.landscape ? " 横向" : ""}；宽度 ${widthName}）`);
    };
    bar.addEventListener("ibp-refresh", refresh);
    refresh();
    // One row: the bar sits in the view header between the note path and "⋯".
    const actions = host.querySelector(":scope > .view-header > .view-actions");
    if (actions) actions.before(bar);
    else host.insertBefore(bar, host.querySelector(":scope > .view-content"));
    host.addClass("ibp-toolbar-host");
    installWidthHandle(view);
    syncWidthFlags();
  };

  // Drag the page edge to set its width. The handle appears when the pointer is near either edge
  // of the page; dragging is symmetric because the page stays centred, and it switches to a custom width.
  const installWidthHandle = (view: MarkdownView) => {
    const content = view.containerEl.querySelector<HTMLElement>(":scope > .view-content");
    if (!content || Platform.isMobile || content.querySelector(":scope > .ibp-width-handle")) return;
    const handle = content.createDiv({ cls: "ibp-width-handle", attr: { "aria-label": tr("拖动调整此设备默认宽度") } });
    const usable = () => !view.containerEl.hasClass("ibp-book-host") && !view.containerEl.hasClass("ibp-source-fixed-width")
      && !(view.file && noteClasses(plugin, view.file).some(cls => cls === "ib-wide" || cls === "ib-narrow"));
    let frame = 0, dragging = false;
    const place = (x: number) => {
      const sizer = visibleSizer(view.containerEl);
      if (!sizer || !usable()) return handle.removeClass("is-visible");
      const box = sizer.getBoundingClientRect(), area = content.getBoundingClientRect();
      const edge = Math.abs(x - box.right) < Math.abs(x - box.left) ? box.right : box.left;
      const near = dragging || Math.abs(x - edge) <= 10;
      handle.toggleClass("is-visible", near);
      if (near && !dragging) handle.setCssStyles({ left: `${Math.round(edge - area.left)}px` });
    };
    plugin.registerDomEvent(content, "pointermove", event => {
      if (dragging || frame) return;
      frame = window.requestAnimationFrame(() => { frame = 0; place(event.clientX); });
    });
    plugin.registerDomEvent(content, "pointerleave", () => { if (!dragging) handle.removeClass("is-visible"); });
    handle.addEventListener("pointerdown", event => {
      const sizer = visibleSizer(view.containerEl);
      if (!sizer || !usable() || event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      handle.setPointerCapture(event.pointerId);
      document.body.addClass("ibp-width-dragging");
      const box = sizer.getBoundingClientRect(), area = content.getBoundingClientRect();
      const centre = box.left + box.width / 2;
      // The share is of the sizer's container (the scroller minus its padding and scrollbar), not of the whole view.
      const parent = sizer.parentElement, pad = getComputedStyle(parent);
      const room = parent.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(page().zoom) || 1));
      const move = (e: PointerEvent) => {
        const share = Math.round(Math.min(100, Math.max(30, (Math.abs(e.clientX - centre) * 2) / (room * zoom) * 100)));
        handle.setCssStyles({ left: `${Math.round(e.clientX - area.left)}px` });
        if (page().width === "custom" && page().customWidth === share) return;
        page().width = "custom";
        page().customWidth = share;
        applyPageSettings(plugin);
      };
      const end = () => {
        dragging = false;
        handle.removeEventListener("pointermove", move);
        document.body.removeClass("ibp-width-dragging");
        handle.removeClass("is-visible");
        save();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end, { once: true });
      handle.addEventListener("pointercancel", end, { once: true });
    });
  };

  // The width button is inert while the editor is not using the readable line width; the theme dims it through this flag.
  const syncWidthFlags = () => document.querySelectorAll<HTMLElement>('.workspace-leaf-content[data-type="markdown"]').forEach(leaf =>
    leaf.toggleClass("ibp-source-fixed-width", Boolean(leaf.querySelector(".markdown-source-view.mod-cm6:not(.is-readable-line-width)"))));
  const sweep = () => {
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) if (leaf.view instanceof MarkdownView) buildToolbar(leaf.view);
    syncWidthFlags();
    refreshPageNumbers(plugin);
  };
  sweep();
  applyPageSettings(plugin);
  plugin.registerEvent(plugin.app.workspace.on("layout-change", sweep));
  // A note's own width (cssclasses) changes the label too.
  plugin.registerEvent(plugin.app.metadataCache.on("changed", () => window.setTimeout(() => document.querySelectorAll(".ibp-toolbar").forEach(bar => bar.dispatchEvent(new CustomEvent("ibp-refresh"))), 50)));
  // The width label shows pixels, which change with the window.
  let resizeTimer = 0;
  plugin.registerEvent(plugin.app.workspace.on("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => document.querySelectorAll(".ibp-toolbar").forEach(bar => bar.dispatchEvent(new CustomEvent("ibp-refresh"))), 150);
  }));
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
    if (mutations.some(m => m.type === "attributes" && m.target.instanceOf(Element) && m.target.matches(".markdown-source-view"))) syncWidthFlags();
    if (!plugin.state.page.paged || pending) return;
    const found = mutations.some(m => m.type === "attributes"
      ? m.target.instanceOf(Element) && m.target.matches(".markdown-source-view, .markdown-reading-view")
      : [...m.addedNodes].some(n => n.instanceOf(Element) && (n.matches(".cm-sizer, .markdown-preview-sizer, .markdown-source-view, .markdown-reading-view") || n.querySelector?.(".cm-sizer, .markdown-preview-sizer"))));
    if (!found) return;
    pending = window.setTimeout(() => { pending = 0; refreshPageNumbers(plugin); refreshReadingPages(plugin); }, 150);
  });
  sizerWatcher.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
  plugin.register(() => sizerWatcher.disconnect());
  plugin.registerEvent(plugin.app.workspace.on("css-change", () => applyPageSettings(plugin)));
  // Ctrl / Cmd + wheel (and trackpad pinch) zooms the page itself instead of changing Obsidian's font size.
  // Diagrams and charts keep their own zoom.
  plugin.registerDomEvent(document, "wheel", event => {
    if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) return;
    if (!event.target.closest(".workspace-leaf-content[data-type='markdown']")) return;
    if (event.target.closest(".ibm-mermaid-enhanced, .ibm-chart-enhanced, .ib-echarts-block, .ib-crop-stage, .ibp-popover, .modal-container")) return;
    event.preventDefault();
    event.stopPropagation();
    const step = Math.min(0.08, Math.abs(event.deltaY) * 0.002);
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((page().zoom || 1) * (event.deltaY < 0 ? 1 + step : 1 - step) * 1000) / 1000));
    if (next === page().zoom) return;
    // Keep the spot under the pointer where it is: remember where in the element under it the pointer sits,
    // zoom, then scroll by however far that point moved.
    const anchor = event.target;
    const scroller = anchor.closest(".markdown-preview-view, .cm-scroller");
    const before = anchor.getBoundingClientRect();
    const fx = before.width ? (event.clientX - before.left) / before.width : 0;
    const fy = before.height ? (event.clientY - before.top) / before.height : 0;
    page().zoom = next;
    save();
    if (!scroller) return;
    const adjust = () => {
      if (!anchor.isConnected) return;
      const after = anchor.getBoundingClientRect();
      scroller.scrollTop += after.top + fy * after.height - event.clientY;
      scroller.scrollLeft += after.left + fx * after.width - event.clientX;
    };
    adjust();
    // The editor measures its lines again after a zoom and may move the scroll; correct once that has settled.
    window.requestAnimationFrame(() => { adjust(); window.setTimeout(adjust, 120); });
  }, { capture: true, passive: false });
  plugin.addCommand({ id: "reset-page-zoom", name: "重置页面缩放", callback: () => { page().zoom = 1; save(); } });
  plugin.register(() => {
    closePopover();
    document.querySelectorAll(".ibp-toolbar, .ibp-book, .ibp-staging").forEach(el => el.remove());
    document.querySelectorAll(".ibp-has-book").forEach(el => el.removeClass("ibp-has-book"));
    document.querySelectorAll(".ibp-book-host, .ibp-toolbar-host, .ibp-source-fixed-width").forEach(el => el.removeClasses(["ibp-book-host", "ibp-toolbar-host", "ibp-source-fixed-width"]));
    removeDocSheet("ibp-print-page");
    document.body.classList.remove("ibp-paged");
    for (const name of ["--ibp-zoom", "--ibp-share", "--ibp-cap", "--ibp-scale", "--ibp-font-size", "--ib-content-max", "--file-line-width", "--ibp-page-w", "--ibp-page-h", "--ibp-page-gap", "--ibp-mt", "--ibp-mr", "--ibp-mb", "--ibp-ml"]) document.body.style.removeProperty(name);
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
