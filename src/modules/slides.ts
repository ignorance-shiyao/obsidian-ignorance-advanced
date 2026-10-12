import { setIcon } from "./ui-icons.js";
import { applyStagedChartAlignment } from "./chart-alignment.js";
import { applyAccent, setThemeMode } from "./appearance.js";
import { nextFrame } from "./export.js";
import { electronRemote } from "./desktop-runtime.js";
import { parseSlideLayout } from "./layout.js";
import { paginateSlideSections } from "./paginate.js";
import { normalizePresentationSkin } from "./skin-choice.js";
import { renderBudget } from "./render-budget.js";
import { THEME_PRESETS, THEME_TOKEN_NAMES, composeThemeTokens } from "./theme-presets.js";
import { splitSlides } from "./split.js";
import { loadChunk } from "./chunks.js";
import { previewThenExport } from "./export-preview.js";
import { capturePortable } from "./portable-capture.js";
import { bytesToBase64 } from "./bytes.js";
import { hasDesktopExports } from "./desktop-runtime.js";
import { saveExportToVault } from "./export.js";
import { renderMarkdownWithContainers } from "./containers.js";
import { structureSlide } from "./structure.js";
import { addEditableSlide } from "./pptx-editable.js";
import { openOffscreenCapturer, stageSlide } from "./offscreen-capture.js";
import { setMarkup } from "./dom-markup.js";

const { Component, ItemView, Menu, Notice, Platform } = require("obsidian");
const VIEW_TYPE = "ignorance-presentation";
const CANVASES = [
  ["16:9", 1280, 720],
  ["16:10", 1280, 800],
  ["4:3", 1200, 900],
  ["9:16", 720, 1280],
];
// A 1280px canvas fitted into a 390px phone screen is drawn at under a third of
// its size and the text is unreadable; phones get their own portrait default,
// kept apart from the desktop choice because the settings file is synced.
function canvasId(settings) {
  return (Platform.isPhone ? settings?.phoneCanvas || "9:16" : settings?.canvas || "16:9");
}
function canvasEntry(settings) {
  const id = canvasId(settings);
  return CANVASES.find(([entry]) => entry === id) || CANVASES[0];
}
const ANIMATIONS = [
  ["none", "无", "不加动效"],
  ["smooth", "淡入上移", "整页轻轻升起"],
  ["fade", "淡入", "整页渐显"],
  ["slide", "右侧滑入", "整页从右侧滑入"],
  ["zoom", "缩放", "由小放大"],
  ["blur", "模糊聚焦", "由模糊变清晰"],
  ["pop", "弹出", "略带回弹的放大"],
  ["cascade", "逐块依次", "每个内容块依次升起"]
];

function presentationDefaults() {
  return { skin: "none", animation: "none", canvas: "16:9" };
}

function stripFrontmatter(markdown) {
  return String(markdown).replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

/* Draw a slide's Mermaid blocks before it is measured. Obsidian draws them
   only once their node is inserted and shown; a slide measured before that
   had the diagram's source split across pages as plain code, and the drawing
   that arrived later went to a detached element. */
let slideDiagramCounter = 0;
async function renderSlideDiagrams(root, width) {
  const blocks = [...root.querySelectorAll("pre > code.language-mermaid")].filter(code => !code.closest(".mermaid"));
  await Promise.all(blocks.map(async code => {
    const pre = code.parentElement;
    const text = (code.textContent || "").replace(/\n$/, "");
    const holder = document.body.createDiv({ cls: "mermaid" });
    holder.style.cssText = `position:absolute;visibility:hidden;width:${width}px`;
    try {
      const { svg } = await window.mermaid.render(`ibs-${Date.now().toString(36)}-${slideDiagramCounter++}`, text, holder);
      const diagram = createDiv({ cls: "mermaid" });
      setMarkup(diagram, svg);
      pre.replaceWith(diagram);
    } catch (_) {
      // Leave the source; Obsidian shows its own error if it draws it.
    } finally {
      holder.remove();
    }
  }));
}

async function settleSlideContent(root) {
  await Promise.all([...root.querySelectorAll("img")].map(img => img.complete ? null : new Promise(resolve => {
    const timer = window.setTimeout(resolve, 2500);
    img.addEventListener("load", () => { window.clearTimeout(timer); resolve(); }, { once: true });
    img.addEventListener("error", () => { window.clearTimeout(timer); resolve(); }, { once: true });
  })));
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const pending = [...root.querySelectorAll(".mermaid, pre.language-mermaid")]
      .some(el => !el.querySelector("svg") && !/Error/i.test(el.textContent || ""));
    if (!pending) break;
    await delay(125);
  }
  // Checked per frame: a fixed 100ms wait per check added a quarter second
  // to every slide, seconds before a long deck could show its first one.
  const frame = () => new Promise(resolve => window.requestAnimationFrame(() => resolve()));
  let previous = -1, stable = 0;
  for (let attempt = 0; attempt < 120 && stable < 3; attempt += 1) {
    await frame();
    const height = root.scrollHeight;
    stable = Math.abs(height - previous) < 1 ? stable + 1 : 0;
    previous = height;
  }
}

function setDefaultSkinVariables(root) {
  for (const [name, value] of Object.entries({
    "--bg": "var(--ib-bg-primary, var(--background-primary))",
    "--fg": "var(--ib-text-primary, var(--text-normal))",
    "--primary-color": "var(--ib-accent-brand, var(--interactive-accent))",
    "--muted": "var(--ib-text-muted, var(--text-muted))",
    "--border": "var(--ib-border-default, var(--background-modifier-border))",
    "--code-bg": "var(--ib-bg-code-block, var(--background-secondary))",
    "--panel-bg": "var(--ib-bg-secondary, var(--background-primary-alt))",
    "--font-family": "var(--ib-font-sans, var(--font-text-theme))",
    "--heading-family": "var(--ib-font-heading, var(--font-interface-theme))",
    "--font-family-mono": "var(--ib-font-mono, var(--font-monospace-theme))",
  })) root.style.setProperty(name, value);
}

/* The eight theme palettes as slide skins, each in light and dark: the same
   tokens the note and the exports use, so a deck matches its document. */
const PALETTE_SKIN = /^palette-([a-z]+)-(light|dark)$/;

function applySkin(root, skinId) {
  [...root.classList].filter(name => name.startsWith("skin-")).forEach(name => root.classList.remove(name));
  for (const name of THEME_TOKEN_NAMES) root.style.removeProperty(name);
  delete root.dataset.ibMode;
  setDefaultSkinVariables(root);
  const palette = PALETTE_SKIN.exec(normalizePresentationSkin(skinId));
  if (palette && THEME_PRESETS.some(preset => preset.id === palette[1])) {
    root.classList.add("skin-palette");
    root.dataset.ibMode = palette[2];
    for (const [name, value] of Object.entries(composeThemeTokens(palette[1], palette[2]))) root.style.setProperty(name, value);
    return;
  }

}

function addToolbarButton(parent, icon, label, action, data = {}) {
  const button = parent.createEl("button", { cls: "ibp-presentation-action", attr: { type: "button", "aria-label": label, "data-tooltip-position": "top" } });
  setIcon(button, icon);
  button.addEventListener("click", action);
  Object.assign(button.dataset, data);
  return button;
}

let openToolbarPopover = null;
function closeToolbarPopover() {
  openToolbarPopover?.();
  openToolbarPopover = null;
}

// A card panel under a toolbar button, for choices that read better with a
// preview than as a text menu. `fill` draws the content; `pick` closes it.
function openPopoverUnder(button, cls, fill) {
  closeToolbarPopover();
  const doc = button.ownerDocument;
  const panel = doc.body.createDiv({ cls: `ibp-popover ${cls}` });
  fill(panel, closeToolbarPopover);
  const box = button.getBoundingClientRect();
  const width = panel.offsetWidth;
  panel.style.left = `${Math.max(8, Math.min(box.left, doc.defaultView.innerWidth - width - 8))}px`;
  panel.style.top = `${box.bottom + 6}px`;
  const onDown = event => { if (!panel.contains(event.target) && !button.contains(event.target)) closeToolbarPopover(); };
  const onKey = event => { if (event.key === "Escape") closeToolbarPopover(); };
  doc.addEventListener("pointerdown", onDown, true);
  doc.addEventListener("keydown", onKey, true);
  openToolbarPopover = () => {
    doc.removeEventListener("pointerdown", onDown, true);
    doc.removeEventListener("keydown", onKey, true);
    panel.remove();
  };
}

// Theme picker: one card per palette showing its paper, ink and accent in
// light and dark; picking a half applies that palette in that mode.
function addThemePicker(parent, plugin, onFollow, onPalette) {
  const button = parent.createEl("button", { cls: "ibp-presentation-picker", attr: { type: "button", "aria-label": "主题（所有视图）", "aria-haspopup": "dialog", "data-tooltip-position": "top" } });
  const text = button.createSpan({ cls: "ibp-presentation-picker-label" });
  setIcon(button.createSpan({ cls: "ibp-presentation-picker-chevron" }), "lucide-chevron-down");
  const dark = () => button.ownerDocument.body.classList.contains("theme-dark");
  const refresh = () => {
    const preset = THEME_PRESETS.find(entry => entry.id === plugin.state.accent);
    text.setText(preset ? `${preset.label} · ${dark() ? "深色" : "浅色"}` : "跟随主题");
  };
  button.addEventListener("click", () => openPopoverUnder(button, "ibp-theme-popover", (panel, close) => {
    const follow = panel.createEl("button", { cls: "ibp-theme-follow", attr: { type: "button" }, text: "跟随主题" });
    follow.addEventListener("click", () => { onFollow(); close(); refresh(); });
    const grid = panel.createDiv({ cls: "ibp-theme-grid" });
    for (const preset of THEME_PRESETS) {
      const card = grid.createDiv({ cls: "ibp-theme-card" });
      card.createDiv({ cls: "ibp-theme-name", text: preset.label });
      const halves = card.createDiv({ cls: "ibp-theme-halves" });
      for (const mode of ["light", "dark"]) {
        const half = halves.createEl("button", { cls: "ibp-theme-half", attr: { type: "button", "aria-label": `${preset.label} · ${mode === "light" ? "浅色" : "深色"}` } });
        const paper = mode === "light" ? preset.lightPaper : preset.darkPaper;
        const ink = mode === "light" ? preset.lightInk : preset.darkInk;
        half.style.setProperty("--p-paper", paper);
        half.style.setProperty("--p-ink", ink);
        half.style.setProperty("--p-accent", preset.accent);
        half.createSpan({ cls: "ibp-theme-title", text: "Aa" });
        half.createSpan({ cls: "ibp-theme-bar" });
        half.createSpan({ cls: "ibp-theme-line" });
        half.createSpan({ cls: "ibp-theme-line is-short" });
        if (plugin.state.accent === preset.id && (mode === "dark") === dark()) half.addClass("is-current");
        half.addEventListener("click", () => { onPalette(preset.id, mode); close(); window.setTimeout(refresh, 80); });
      }
    }
  }));
  refresh();
  return button;
}

// Animation picker: every row replays its motion on a small page while hovered.
function addAnimationPicker(parent, options, current, onPick) {
  const button = parent.createEl("button", { cls: "ibp-presentation-picker", attr: { type: "button", "aria-label": "进入动效", "aria-haspopup": "dialog", "data-tooltip-position": "top" } });
  const text = button.createSpan({ cls: "ibp-presentation-picker-label" });
  setIcon(button.createSpan({ cls: "ibp-presentation-picker-chevron" }), "lucide-chevron-down");
  const refresh = () => text.setText(options.find(([value]) => value === current())?.[1] || options[0][1]);
  button.addEventListener("click", () => openPopoverUnder(button, "ibp-anim-popover", (panel, close) => {
    for (const [value, title, hint] of options) {
      const row = panel.createEl("button", { cls: "ibp-anim-row", attr: { type: "button" } });
      if (value === current()) row.addClass("is-current");
      const demo = row.createDiv({ cls: `ibp-anim-demo ibp-anim-demo-${value}` });
      demo.createSpan({ cls: "ibp-anim-bar" });
      demo.createSpan({ cls: "ibp-anim-line" });
      demo.createSpan({ cls: "ibp-anim-line is-short" });
      const label = row.createDiv({ cls: "ibp-anim-label" });
      label.createDiv({ cls: "ibp-anim-title", text: title });
      label.createDiv({ cls: "ibp-anim-hint", text: hint });
      const replay = () => { demo.removeClass("is-playing"); void demo.offsetWidth; demo.addClass("is-playing"); };
      row.addEventListener("pointerenter", replay);
      row.addEventListener("click", () => { onPick(value); close(); refresh(); });
    }
  }));
  refresh();
  return button;
}

// A button that opens Obsidian's own menu (styled by the theme) instead of a
// <select>, whose popup is drawn by the operating system.
function addToolbarPicker(parent, label, options, current, onPick) {
  const button = parent.createEl("button", { cls: "ibp-presentation-picker", attr: { type: "button", "aria-label": label, "aria-haspopup": "menu", "data-tooltip-position": "top" } });
  const text = button.createSpan({ cls: "ibp-presentation-picker-label" });
  setIcon(button.createSpan({ cls: "ibp-presentation-picker-chevron" }), "lucide-chevron-down");
  const refresh = () => text.setText(options.find(([value]) => value === current())?.[1] || options[0][1]);
  button.addEventListener("click", () => {
    const menu = new Menu();
    for (const [value, title] of options) {
      // A null value starts a titled group.
      if (value === null) {
        menu.addSeparator();
        menu.addItem(item => item.setTitle(title).setDisabled(true).setIsLabel?.(true));
        continue;
      }
      menu.addItem(item => item.setTitle(title).setChecked(value === current()).onClick(() => { onPick(value); refresh(); }));
    }
    const box = button.getBoundingClientRect();
    menu.showAtPosition({ x: box.left, y: box.bottom + 4 });
  });
  refresh();
  return button;
}

// Whether an element between target and boundary can still scroll that way.
function canScrollInside(target, boundary, delta) {
  for (let el = target instanceof Element ? target : null; el && el !== boundary; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight + 1) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    if (delta > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
  }
  return false;
}

function addToolbarSeparator(parent) {
  parent.createDiv({ cls: "ibp-presentation-sep" });
}

function makeDataUri(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(xml))}`;
}

/* Renders a note into Reveal slide sections: split at ---, laid out at the
   canvas size, long pages split automatically, then structured. Shared by the
   presentation view and PPTX export straight from a note. Returns null when
   `isCurrent()` turns false (a newer render started). */
export async function buildDeck(plugin, file, component, isCurrent = () => true, { limit = Infinity } = {}) {
  const markdown = await plugin.app.vault.cachedRead(file);
  if (!isCurrent()) return null;
  const settings = plugin.state.presentation || {};
  const [, width, height] = canvasEntry(settings);
  const allColumns = splitSlides(stripFrontmatter(markdown)).columns;
  const columns = allColumns.slice(0, limit);
  const measure = document.body.createDiv({ cls: "ibp-slide-measure reveal" });
  measure.style.width = `${width}px`;
  measure.style.height = `${height}px`;
  applySkin(measure, settings.skin || "none");
  const rows = [];
  const chrome = false;
  let badgeIndex = 0;
  try {
    // Let input and painting run between slides; a long deck is otherwise one long task per slide.
    const pause = renderBudget(undefined, 16);
    for (const column of columns) {
      const row = [];
      for (const source of column) {
        await pause();
        const parsed = parseSlideLayout(source);
        const surface = createEl("section");
        surface.className = `slide-surface slide-layout-${parsed.layout}`;
        surface.style.width = `${width}px`;
        surface.style.height = `${height}px`;
        surface.dataset.directiveOffset = String(parsed.directiveOffset);
        if (parsed.tag) surface.dataset.slideTag = parsed.tag;
        const inner = createDiv();
        inner.className = "slide-inner";
        surface.appendChild(inner);
        // Same renderer as paged reading, so ::: containers (kpi, cols, panel…) work in slides.
        await renderMarkdownWithContainers(plugin, file.path, parsed.body, inner, component);
        await renderSlideDiagrams(inner, width);
        await applyStagedChartAlignment(plugin, inner, file.path, parsed.body);
        if (!isCurrent()) return null;
        const wrapper = createDiv();
        wrapper.appendChild(surface);
        measure.appendChild(wrapper);
        await settleSlideContent(surface);
        paginateSlideSections(wrapper);
        const queue = [...wrapper.children].filter(el => el.instanceOf(HTMLElement));
        for (let q = 0; q < queue.length; q += 1) {
          const page = queue[q];
          const layout = (Array.from(page.classList).find(name => name.startsWith("slide-layout-")) || "slide-layout-default").slice("slide-layout-".length);
          const isContent = ["default", "split", "grid"].includes(layout);
          const badge = chrome && isContent && !page.dataset.autopage ? String.fromCharCode(65 + (badgeIndex++ % 26)) : "";
          const rawClass = page.className;
          const heading = page.querySelector(":scope > .slide-inner > :first-child");
          const repeat = heading && /^H[1-4]$/.test(heading.tagName) ? heading.cloneNode(true) : null;
          structureSlide(page, layout, { chrome, badge, tag: page.dataset.slideTag || "" });
          // Pages are split before the title bar and body frame exist, so the
          // body can still come out taller than its frame; move the overflow
          // on to a continuation page rather than clip it.
          const body = layout === "default" ? page.querySelector(".slide-body") : null;
          // A page holding nothing but headings: they belong on the next page.
          const following = queue[q + 1];
          if (body && following && !following.querySelector(".slide-body") && [...body.children].every(el => /^H[1-6]$/.test(el.tagName))) {
            const target = following.querySelector(":scope > .slide-inner");
            const after = target?.querySelector(":scope > [data-auto-repeat]");
            if (target) {
              const headings = [...body.children];
              if (after) after.after(...headings); else target.prepend(...headings);
              page.remove();
              continue;
            }
          }
          const carry = [];
          const frame = body?.parentElement;
          const floor = () => {
            const box = frame.getBoundingClientRect();
            return box.bottom - (parseFloat(getComputedStyle(frame).paddingBottom) || 0);
          };
          // The body can overflow itself, or be clipped by the frame around it.
          const overflows = () => body.scrollHeight > body.clientHeight + 4
            || body.lastElementChild.getBoundingClientRect().bottom > floor() + 2;
          while (body && body.children.length > 1 && overflows()) {
            carry.unshift(body.lastElementChild);
            body.lastElementChild.remove();
          }
          // A heading left last on the page goes with what it introduces.
          while (carry.length && body.children.length > 1 && /^H[1-6]$/.test(body.lastElementChild.tagName)) {
            carry.unshift(body.lastElementChild);
            body.lastElementChild.remove();
          }
          if (carry.length) {
            const next = createEl("section");
            next.className = rawClass;
            next.style.width = `${width}px`;
            next.style.height = `${height}px`;
            next.dataset.autopage = String(Number(page.dataset.autopage || 1) + 1);
            next.dataset.directiveOffset = page.dataset.directiveOffset || "0";
            if (page.dataset.slideTag) next.dataset.slideTag = page.dataset.slideTag;
            const nextInner = next.createDiv({ cls: "slide-inner" });
            if (repeat) { repeat.dataset.autoRepeat = "1"; nextInner.appendChild(repeat); }
            carry.forEach(block => nextInner.appendChild(block));
            page.after(next);
            queue.splice(q + 1, 0, next);
          }
          page.style.removeProperty("width");
          page.style.removeProperty("height");
          row.push(page);
        }
        // Done measuring this slide: leaving it in the measuring box made every
        // later slide's layout pass include all earlier ones (quadratic).
        wrapper.remove();
      }
      rows.push({ vertical: column.length > 1, pages: row });
    }
    if (!isCurrent()) return null;
    const reveal = createDiv();
    reveal.className = "reveal";
    // Entrance motion and cross-fades repaint a whole slide per frame; phones drop frames on them.
    if (!Platform.isPhone && settings.animation && settings.animation !== "none") reveal.classList.add(`slide-anim-${settings.animation}`);
    applySkin(reveal, settings.skin || "none");
    const slides = reveal.createDiv({ cls: "slides" });
    const entries = [];
    let horizontalIndex = 0;
    for (const row of rows) {
      if (row.vertical) {
        const stack = slides.createEl("section", { cls: "stack" });
        row.pages.forEach((page, verticalIndex) => {
          stack.appendChild(page);
          entries.push({ h: horizontalIndex, v: verticalIndex, el: page });
        });
      } else {
        row.pages.forEach((page, pageIndex) => {
          slides.appendChild(page);
          entries.push({ h: horizontalIndex + pageIndex, v: 0, el: page });
        });
        horizontalIndex += Math.max(0, row.pages.length - 1);
      }
      horizontalIndex += 1;
    }
    return { reveal, entries, width, height, partial: columns.length < allColumns.length };
  } finally {
    measure.remove();
  }
}

class PresentationView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.filePath = "";
    this.renderToken = 0;
    this.deck = null;
    this.renderComponent = null;
    this.slideEntries = [];
    this.preferredIndices = [0, 0];
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
    return file?.basename ? `${file.basename} · 演示` : "演示模式";
  }
  getIcon() { return "lucide-presentation"; }
  getState() { return { filePath: this.filePath, returnMode: this.returnMode }; }

  async setState(state) {
    this.filePath = typeof state?.filePath === "string" ? state.filePath : "";
    this.returnMode = state?.returnMode === "preview" ? "preview" : "source";
    await this.renderSlides();
  }

  async onOpen() {
    this.containerEl.addClass("ibp-presentation-view");
    this.contentEl.addClass("ibp-presentation-content");
    this.contentEl.empty();
    this.stage = this.contentEl.createDiv({ cls: "ibp-presentation-stage" });
    this.toolbar = this.contentEl.createDiv({ cls: "ibp-presentation-toolbar" });
    this.buildToolbar();
    this.registerDomEvent(window, "ib-theme-change", () => {
      if (document.body.dataset.ibThemeCapture) return;
      if (this.deck?.getIndices) { const index = this.deck.getIndices(); this.preferredIndices = [index.h, index.v]; }
      this.plugin.state.presentation.skin = "none";
      void this.renderSlides();
    });
    this.installWheelPaging();
    this.resizeObserver = new ResizeObserver(() => this.deck?.layout?.());
    this.resizeObserver.observe(this.stage);
    if (this.filePath) await this.renderSlides();
  }

  async onClose() {
    this.renderToken += 1;
    this.resizeObserver?.disconnect();
    this.deck?.destroy?.();
    this.deck = null;
    this.renderComponent?.unload?.();
    this.renderComponent = null;
  }

  /* One bar holds everything for this view: slide navigation, look, output and
     layout. Reveal's own controls and the header's "more" menu are not used. */
  buildToolbar() {
    addToolbarButton(this.toolbar, "lucide-file-text", "返回笔记", () => { void this.returnToNote(); });
    addToolbarSeparator(this.toolbar);
    this.prevButton = addToolbarButton(this.toolbar, "lucide-chevron-left", "上一页", () => this.goPrev());
    this.counter = this.toolbar.createDiv({ cls: "ibp-presentation-counter", text: "– / –" });
    this.nextButton = addToolbarButton(this.toolbar, "lucide-chevron-right", "下一页", () => this.goNext());
    addToolbarSeparator(this.toolbar);

    const settings = this.plugin.state.presentation;
    const choose = (key, value) => { settings[key] = value; this.plugin.saveStoredState(); };
    addThemePicker(this.toolbar, this.plugin,
      () => { choose("skin", "none"); void this.renderSlides(); },
      (id, mode) => { choose("skin", "none"); applyAccent(this.plugin, id); setThemeMode(this.plugin.app, mode); });
    addToolbarPicker(this.toolbar, "演示画幅", CANVASES.filter(([id]) => Platform.isPhone || id !== "9:16").map(([id]) => [id, id]),
      () => canvasId(settings), value => { choose(Platform.isPhone ? "phoneCanvas" : "canvas", value); void this.renderSlides(); });
    addAnimationPicker(this.toolbar, ANIMATIONS,
      () => settings.animation || "none", value => {
        choose("animation", value);
        this.root?.classList.forEach(name => { if (name.startsWith("slide-anim-")) this.root.classList.remove(name); });
        if (value !== "none" && !Platform.isPhone) this.root?.classList.add(`slide-anim-${value}`);
      });

    addToolbarSeparator(this.toolbar);
    this.pointerButtons = [];
    this.pointerButtons.push(addToolbarButton(this.toolbar, "lucide-crosshair", "激光笔（再点一次关闭）", () => this.setPointerTool("laser"), { tool: "laser" }));
    this.pointerButtons.push(addToolbarButton(this.toolbar, "lucide-flashlight", "聚光灯（再点一次关闭）", () => this.setPointerTool("spot"), { tool: "spot" }));
    this.stepButtons = [addToolbarButton(this.toolbar, "lucide-list-start", "逐段显示：每按一次下一页先显示下一段（再点一次关闭）", () => this.setStepMode(!this.stepMode))];
    addToolbarButton(this.toolbar, "lucide-eye-off", "安静视图：隐藏工具栏，鼠标移到顶部时显示", () => this.contentEl.classList.toggle("ibp-quiet"));
    addToolbarSeparator(this.toolbar);
    addToolbarButton(this.toolbar, "lucide-maximize", "全屏放映", () => {
      const root = this.stage.querySelector(".reveal");
      if (root?.requestFullscreen) void root.requestFullscreen();
    });
    this.exportButton = addToolbarButton(this.toolbar, "lucide-file-down", "导出 PPTX", () => {
      const menu = new Menu();
      menu.addItem(item => item.setTitle("PPTX（可编辑）").setIcon("lucide-presentation").onClick(() => this.previewPptx("editable")));
      menu.addItem(item => item.setTitle("PPTX（图片版，高保真、不可编辑）").setIcon("lucide-image").onClick(() => this.previewPptx("image")));
      const box = this.exportButton.getBoundingClientRect();
      menu.showAtPosition({ x: box.left, y: box.bottom + 4 });
    });
    addToolbarSeparator(this.toolbar);
    addToolbarButton(this.toolbar, "lucide-columns-2", "左右分屏", () => this.split("vertical"));
    addToolbarButton(this.toolbar, "lucide-rows-2", "上下分屏", () => this.split("horizontal"));
  }

  async returnToNote() {
    if (!this.filePath) return;
    const state = { file: this.filePath, mode: this.returnMode || "source" };
    await this.leaf.setViewState({ type: "markdown", active: true, state }, { focus: true });
  }

  split(direction) {
    const leaf = this.app.workspace.getLeaf("split", direction);
    void leaf.setViewState({ type: VIEW_TYPE, active: true, state: { filePath: this.filePath } });
  }

  /* Wheel / trackpad paging: one slide per gesture. Deltas are summed until a
     threshold, then further events are ignored briefly so trackpad momentum
     cannot skip slides. Content that scrolls inside a slide scrolls first;
     Ctrl + wheel (pinch) is left alone. The stage also hosts fullscreen. */
  installWheelPaging() {
    // A mouse wheel turns one page per notch, however fast it spins; the lock
    // used to extend on every event, so a steady spin turned one page and then
    // nothing until the wheel stopped. A trackpad swipe (small deltas with an
    // inertia tail) still turns one page per swipe.
    let sum = 0;
    let lastTurn = 0;
    let swipeLocked = false;
    let swipeTimer = 0;
    this.registerDomEvent(this.stage, "wheel", event => {
      if (!this.deck || event.ctrlKey) return;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta || canScrollInside(event.target, this.stage, delta)) return;
      event.preventDefault();
      const now = Date.now();
      const notch = event.deltaMode !== 0 || (Math.abs(delta) >= 50 && Number.isInteger(delta));
      if (notch) {
        if (now - lastTurn < 120) return;
        lastTurn = now;
        if (delta > 0) this.goNext(); else this.goPrev();
        return;
      }
      // Trackpad: the swipe ends when events pause.
      window.clearTimeout(swipeTimer);
      swipeTimer = window.setTimeout(() => { swipeLocked = false; sum = 0; }, 160);
      if (swipeLocked) return;
      sum += delta;
      if (Math.abs(sum) < 40) return;
      if (sum > 0) this.goNext(); else this.goPrev();
      sum = 0;
      swipeLocked = true;
      lastTurn = now;
    }, { passive: false });
  }

  /* Fullscreen shows only the Reveal element, so it carries its own quiet page
     control: shown while the pointer moves, faded out after a short idle. */
  buildFullscreenNav(reveal) {
    const nav = reveal.createDiv({ cls: "ibp-fullscreen-nav" });
    this.fullscreenPrev = addToolbarButton(nav, "lucide-chevron-left", "上一页", () => this.goPrev());
    this.fullscreenCounter = nav.createDiv({ cls: "ibp-presentation-counter" });
    this.fullscreenNext = addToolbarButton(nav, "lucide-chevron-right", "下一页", () => this.goNext());
    addToolbarSeparator(nav);
    this.pointerButtons = (this.pointerButtons || []).filter(button => button.isConnected && !nav.contains(button));
    this.pointerButtons.push(addToolbarButton(nav, "lucide-crosshair", "激光笔", () => this.setPointerTool("laser"), { tool: "laser" }));
    this.pointerButtons.push(addToolbarButton(nav, "lucide-flashlight", "聚光灯", () => this.setPointerTool("spot"), { tool: "spot" }));
    this.stepButtons = (this.stepButtons || []).filter(button => button.isConnected && !nav.contains(button));
    this.stepButtons.push(addToolbarButton(nav, "lucide-list-start", "逐段显示", () => this.setStepMode(!this.stepMode)));
    this.buildPointerOverlay(reveal);
    let idle = 0;
    const wake = () => {
      reveal.addClass("is-pointer-active");
      window.clearTimeout(idle);
      idle = window.setTimeout(() => { if (!nav.matches(":hover")) reveal.removeClass("is-pointer-active"); }, 2000);
    };
    reveal.addEventListener("pointermove", wake);
    nav.addEventListener("pointerleave", wake);
  }

  /* Laser pointer and spotlight: an overlay inside the Reveal element (so it also shows in fullscreen) that
     follows the pointer. Only one tool is active at a time; the choice survives re-renders of the deck. */
  buildPointerOverlay(reveal) {
    const overlay = reveal.createDiv({ cls: "ibp-pointer-overlay" });
    overlay.setAttribute("aria-hidden", "true");
    overlay.createDiv({ cls: "ibp-spot" });
    overlay.createDiv({ cls: "ibp-laser" });
    reveal.addEventListener("pointermove", event => {
      if (!this.pointerTool) return;
      const box = reveal.getBoundingClientRect();
      overlay.style.setProperty("--ibp-px", `${event.clientX - box.left}px`);
      overlay.style.setProperty("--ibp-py", `${event.clientY - box.top}px`);
    });
    this.applyPointerTool();
  }

  /* Step-by-step reveal: the blocks of a slide appear one at a time (the unrevealed ones stay dimmed), so
     "next" first shows the next block and only then moves to the next slide. */
  slideBlocks(section) {
    const host = section?.querySelector(".slide-body") || section?.querySelector(":scope > .slide-inner");
    return host ? [...host.children].filter(element => element instanceof HTMLElement) : [];
  }

  showSteps(section, shown) {
    const blocks = this.slideBlocks(section);
    section.dataset.ibShown = String(shown);
    blocks.forEach((block, index) => block.classList.toggle("ibp-step-hidden", index >= shown));
  }

  stepForward() {
    const section = this.deck?.getCurrentSlide?.();
    const blocks = this.slideBlocks(section);
    if (blocks.length < 2) return false;
    const shown = Number(section.dataset.ibShown || 1);
    if (shown >= blocks.length) return false;
    this.showSteps(section, shown + 1);
    return true;
  }

  stepBack() {
    const section = this.deck?.getCurrentSlide?.();
    const shown = Number(section?.dataset.ibShown || 0);
    if (!section || shown <= 1) return false;
    this.showSteps(section, shown - 1);
    return true;
  }

  goNext() { if (!(this.stepMode && this.stepForward())) this.deck?.next(); }
  goPrev() { if (!(this.stepMode && this.stepBack())) this.deck?.prev(); }

  onSlideChanged(event) {
    const forward = (event?.indexh ?? 0) >= (this.lastSlideH ?? 0);
    this.lastSlideH = event?.indexh ?? 0;
    if (!this.stepMode) return;
    const section = this.deck?.getCurrentSlide?.();
    if (section) this.showSteps(section, forward ? 1 : this.slideBlocks(section).length);
  }

  setStepMode(on) {
    this.stepMode = Boolean(on);
    this.applyStepMode();
  }

  applyStepMode() {
    this.root?.classList.toggle("ibp-stepping", Boolean(this.stepMode));
    for (const button of this.stepButtons || []) button.classList.toggle("is-active", Boolean(this.stepMode));
    if (!this.root) return;
    if (this.stepMode) {
      const section = this.deck?.getCurrentSlide?.();
      if (section) this.showSteps(section, 1);
    } else {
      this.root.querySelectorAll(".ibp-step-hidden").forEach(element => element.classList.remove("ibp-step-hidden"));
      this.root.querySelectorAll("[data-ib-shown]").forEach(element => element.removeAttribute("data-ib-shown"));
    }
  }

  setPointerTool(tool) {
    this.pointerTool = this.pointerTool === tool ? null : tool;
    this.applyPointerTool();
  }

  applyPointerTool() {
    this.root?.classList.toggle("ibp-tool-laser", this.pointerTool === "laser");
    this.root?.classList.toggle("ibp-tool-spot", this.pointerTool === "spot");
    for (const button of this.pointerButtons || []) button.classList.toggle("is-active", button.dataset.tool === this.pointerTool);
  }

  updateCounter() {
    const total = this.slideEntries.length;
    const indices = this.deck?.getIndices?.();
    const current = indices ? this.slideEntries.findIndex(entry => entry.h === indices.h && entry.v === (indices.v || 0)) : -1;
    const text = total ? `${Math.max(0, current) + 1} / ${total}` : "– / –";
    for (const [counter, prev, next] of [[this.counter, this.prevButton, this.nextButton], [this.fullscreenCounter, this.fullscreenPrev, this.fullscreenNext]]) {
      counter?.setText(text);
      prev?.toggleClass("is-disabled", current <= 0);
      next?.toggleClass("is-disabled", current >= total - 1);
    }
  }

  async renderSlides() {
    if (!this.stage) return;
    const token = ++this.renderToken;
    if (this.deck) {
      try {
        const indices = this.deck.getIndices?.();
        if (indices) this.preferredIndices = [indices.h || 0, indices.v || 0];
        this.deck.destroy();
      } catch (_) { /* the view may be closing */ }
      this.deck = null;
    }
    this.renderComponent?.unload?.();
    this.renderComponent = null;
    this.stage.empty();
    this.slideEntries = [];
    const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
    if (!file || file.extension !== "md") {
      this.stage.createDiv({ cls: "ibp-presentation-empty", text: this.filePath ? `找不到笔记「${this.filePath}」，它可能已被移动或删除。` : "请从 Markdown 笔记打开演示模式。" });
      return;
    }
    const component = new Component();
    component.load();
    this.renderComponent = component;
    const current = () => token === this.renderToken;
    try {
      // First slide at once, then the whole deck: building every slide first
      // kept a long note's presentation blank for seconds.
      const first = await buildDeck(this.plugin, file, component, current, { limit: 1 });
      if (!first) return;
      await this.mountDeck(first, token);
      if (!first.partial || !current()) return;
      const full = await buildDeck(this.plugin, file, component, current);
      if (!full || !current()) return;
      // The one-slide deck cannot have moved; keep the page asked for.
      await this.mountDeck(full, token);
    } catch (error) {
      if (current()) {
        this.stage.empty();
        this.stage.createDiv({ cls: "ibp-presentation-error", text: `演示排版失败：${error.message || error}` });
      }
    }
  }

  async mountDeck({ reveal, entries, width, height }, token) {
    if (this.deck) {
      try { this.deck.destroy(); } catch (_) { /* already gone */ }
      this.deck = null;
    }
    this.stage.empty();
    this.slideEntries = entries;
    this.stage.appendChild(reveal);
    this.root = reveal;
    this.buildFullscreenNav(reveal);
    // The title depends on filePath, which setState/rename change after Obsidian drew the header.
    this.leaf.updateHeader?.();
    this.titleEl?.setText(this.getDisplayText());
    const { Reveal } = await loadChunk("chunk-reveal.cjs");
    const deck = new Reveal(reveal, {
      embedded: true,
      keyboardCondition: "focused",
      hash: false,
      controls: false,
      progress: false,
      slideNumber: false,
      width,
      height,
      // Leave room around the slide so it floats on the themed stage.
      margin: 0.06,
      // A short cross-fade between slides instead of a hard cut; the
      // content's own entrance animation runs on top of it.
      transition: Platform.isPhone ? "none" : "fade",
      transitionSpeed: "fast",
      backgroundTransition: "none",
      scrollActivationWidth: 0,
    });
    this.deck = deck;
    await deck.initialize();
    if (token !== this.renderToken) { deck.destroy(); return; }
    deck.layout();
    deck.slide(this.preferredIndices[0], this.preferredIndices[1]);
    deck.on("slidechanged", event => { this.onSlideChanged(event); this.updateCounter(); });
    this.lastSlideH = deck.getIndices?.().h ?? 0;
    // Capture phase, so a step is taken before Reveal sees the key.
    reveal.addEventListener("keydown", event => {
      if (!this.stepMode || event.altKey || event.ctrlKey || event.metaKey) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key) && this.stepForward()) { event.preventDefault(); event.stopPropagation(); }
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key) && this.stepBack()) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    this.applyStepMode();
    this.updateCounter();
  }

  previewPptx(mode) {
    const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
    previewThenExport(this.plugin, file, `pptx-${mode}`, { buildDeck }, () => { void this.exportPptx("", mode); });
  }

  async exportPptx(targetPath = "", mode = "editable") {
    if (!this.deck || !this.slideEntries.length) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(this.filePath);
    const filePath = await choosePptxPath(file, targetPath);
    if (!filePath) return;
    this.exportButton?.addClass("is-busy");
    this.exportButton?.setAttr("disabled", "true");
    // Every block must be fully visible in the export, whatever step the show is at.
    const wasStepping = this.stepMode;
    if (wasStepping) this.setStepMode(false);
    try {
      await exportDeckPptx({ plugin: this.plugin, reveal: this.root, entries: this.slideEntries, width: this.slideSize().width, height: this.slideSize().height }, filePath, mode);
    } finally {
      if (wasStepping) this.setStepMode(true);
      this.exportButton?.removeClass("is-busy");
      this.exportButton?.removeAttribute("disabled");
    }
  }

  slideSize() {
    const [, width, height] = canvasEntry(this.plugin.state.presentation);
    return { width, height };
  }
}

// Picture version: the whole slide as one image, charts laid over as SVG.
async function addImageSlide(pptx, surface, slideWidth, slideHeight, capture) {
  const surfaceRect = surface.getBoundingClientRect();
  const charts = [...surface.querySelectorAll(".mermaid svg, .ib-echarts-block svg, [data-ib-echarts-state] svg")].map(svg => {
    const rect = svg.getBoundingClientRect();
    return { svg, x: rect.left - surfaceRect.left, y: rect.top - surfaceRect.top, w: rect.width, h: rect.height, visible: svg.style.visibility };
  });
  let png;
  try {
    charts.forEach(chart => { chart.svg.style.visibility = "hidden"; });
    png = await capture(surface);
  } finally {
    charts.forEach(chart => { chart.svg.style.visibility = chart.visible; });
  }
  const slide = pptx.addSlide();
  slide.addImage({ data: `data:image/png;base64,${bytesToBase64(png)}`, x: 0, y: 0, w: slideWidth, h: slideHeight });
  for (const chart of charts) {
    if (chart.w < 2 || chart.h < 2) continue;
    slide.addImage({
      data: makeDataUri(chart.svg),
      x: chart.x / surfaceRect.width * slideWidth,
      y: chart.y / surfaceRect.height * slideHeight,
      w: chart.w / surfaceRect.width * slideWidth,
      h: chart.h / surfaceRect.height * slideHeight,
    });
  }
}

// Mobile has no save dialog: the deck goes to the vault's 导出/ folder.
const VAULT_TARGET = "vault:";

async function choosePptxPath(file, targetPath = "") {
  if (targetPath) return targetPath;
  if (!hasDesktopExports()) return `${VAULT_TARGET}${file?.basename || "演示"}.pptx`;
  const remote = electronRemote();
  if (!remote?.dialog?.showSaveDialog) {
    new Notice("当前环境暂不支持导出 PPTX。", 5000);
    return "";
  }
  const choice = await remote.dialog.showSaveDialog({
    title: "导出演示文稿",
    defaultPath: `${file?.basename || "演示"}.pptx`,
    filters: [{ name: "PowerPoint", extensions: ["pptx"] }],
    properties: ["showOverwriteConfirmation", "createDirectory"],
  });
  return choice.canceled ? "" : choice.filePath || "";
}

/* Writes a built deck to a .pptx file. Slides are copied off-screen and
   captured in a hidden window, so nothing on screen changes; progress is one
   notice that updates in place. */
// Mobile capture: the staged slide sits far off-screen; bring it to the origin
// underneath the app (so nothing flashes) while html2canvas paints it.
async function capturePortableStage(staged) {
  const { stage } = staged;
  const previous = { left: stage.style.left, zIndex: stage.style.zIndex };
  stage.style.left = "0px";
  stage.style.zIndex = "-1";
  try {
    return await capturePortable(staged.surface, { scale: 2 });
  } finally {
    stage.style.left = previous.left;
    stage.style.zIndex = previous.zIndex;
  }
}

async function exportDeckPptx(deck, filePath, mode = "editable") {
  const { reveal, entries, width: canvasWidth, height: canvasHeight } = deck;
  const { PptxGenJS } = await loadChunk("chunk-pptx.cjs");
  const pptx = new PptxGenJS();
  const slideWidth = 13.333333;
  const slideHeight = slideWidth * canvasHeight / canvasWidth;
  pptx.defineLayout({ name: "IGNORANCE_WIDE", width: slideWidth, height: slideHeight });
  pptx.layout = "IGNORANCE_WIDE";
  const total = entries.length;
  const progress = new Notice(`正在导出 PPTX：0 / ${total} 页`, 0);
  let capturer = null;
  try {
    const desktop = hasDesktopExports();
    if (desktop) capturer = await openOffscreenCapturer(canvasWidth, canvasHeight);
    for (const [index, entry] of entries.entries()) {
      const staged = stageSlide(reveal, entry.el, canvasWidth, canvasHeight);
      try {
        await Promise.all([...staged.surface.querySelectorAll("img")].map(img => img.decode().catch(() => null)));
        await nextFrame();
        const capture = desktop ? () => capturer.capture(staged.html()) : () => capturePortableStage(staged);
        if (mode === "editable") await addEditableSlide(pptx, staged.surface, { slideWidth, slideHeight, canvasWidth }, capture);
        else await addImageSlide(pptx, staged.surface, slideWidth, slideHeight, capture);
      } finally {
        staged.remove();
      }
      progress.setMessage(`正在导出 PPTX：${index + 1} / ${total} 页`);
      // Each slide is a burst of main-thread work; yield so the app stays usable.
      await nextFrame();
    }
    progress.setMessage("正在写入 PPTX 文件…");
    // pptxgenjs's writeFile() imports node:fs dynamically, which Obsidian's
    // renderer cannot load; take the bytes and write them ourselves.
    let savedPath = filePath;
    if (filePath.startsWith(VAULT_TARGET)) {
      const bytes = await pptx.write({ outputType: "uint8array" });
      savedPath = await saveExportToVault(deck.plugin, filePath.slice(VAULT_TARGET.length), bytes);
    } else {
      const bytes = await pptx.write({ outputType: "nodebuffer" });
      await require("fs").promises.writeFile(filePath, bytes);
    }
    progress.hide();
    new Notice(`PPTX 已导出：${savedPath}`, 7000);
  } catch (error) {
    progress.hide();
    new Notice(`PPTX 导出失败：${error.message || error}`, 7000);
  } finally {
    capturer?.close();
    progress.hide();
  }
}

/* Export straight from a note: build the deck off-screen with the current
   presentation settings, without opening the presentation view. */
export async function exportNotePptx(plugin, file, mode = "editable", targetPath = "") {
  if (file?.extension !== "md") return;
  const filePath = await choosePptxPath(file, targetPath);
  if (!filePath) return;
  const preparing = new Notice("正在排版幻灯片…", 0);
  const component = new Component();
  component.load();
  try {
    const deck = await buildDeck(plugin, file, component);
    preparing.hide();
    if (deck) await exportDeckPptx({ ...deck, plugin }, filePath, mode);
  } catch (error) {
    new Notice(`PPTX 导出失败：${error.message || error}`, 7000);
  } finally {
    preparing.hide();
    component.unload();
  }
}

/* Presenting is a view switch, not a new document: the note's own tab turns
   into the presentation (recorded in the tab's history, so Back works too),
   and 返回笔记 switches it back in the mode it was left in. */
export async function openPresentation(plugin, file, leaf = plugin.app.workspace.getLeaf(false)) {
  if (!file || file.extension !== "md") {
    new Notice("请先打开一篇 Markdown 笔记。", 5000);
    return;
  }
  const returnMode = leaf.view?.getMode?.() === "preview" ? "preview" : "source";
  await leaf.setViewState({ type: VIEW_TYPE, active: true, state: { filePath: file.path, returnMode } }, { focus: true });
}

export function installPresentationMode(plugin) {
  plugin.state.presentation = Object.assign(presentationDefaults(), plugin.state.presentation || {});
  plugin.registerView(VIEW_TYPE, leaf => new PresentationView(leaf, plugin));
  plugin.addCommand({
    id: "open-presentation-mode",
    name: "在演示视图中打开当前笔记",
    callback: () => openPresentation(plugin, plugin.app.workspace.getActiveFile()),
  });
  plugin.registerEvent(plugin.app.vault.on("modify", file => {
    if (file?.extension !== "md") return;
    for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view.filePath === file.path) void leaf.view.renderSlides();
    }
  }));
  // Like a note tab, a presentation closes when its note is deleted.
  plugin.registerEvent(plugin.app.vault.on("delete", file => {
    for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view.filePath === file.path) leaf.detach();
    }
  }));
  plugin.registerEvent(plugin.app.vault.on("rename", (file, oldPath) => {
    for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view.filePath === oldPath) {
        leaf.view.filePath = file.path;
        void leaf.view.renderSlides();
      }
    }
  }));
}
