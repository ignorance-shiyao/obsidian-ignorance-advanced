import { setIcon, UI_ICONS } from "./ui-icons.js";
import * as MermaidCore from "./mermaid-core.js";
import { showCopyFeedback } from "./copy-feedback";
import { holdScrollPosition, replaceOffsetsQuietly } from "./quiet-edit.js";
import { openLanguagePicker, fenceLanguage, withFenceLanguage } from "./language-picker.js";
import { createLanguageIcon } from "./language-icons.js";

const { buildMermaidDecorations, t } = MermaidCore;
const { Notice, Menu } = require("obsidian");
const { Decoration, ViewPlugin, WidgetType, EditorView } = require("@codemirror/view");
const { StateEffect } = require("@codemirror/state");

function writingModeDefaults() {
  return { typewriterScroll: false, focusMode: false };
}


const DENSITIES = ["compact", "normal", "relaxed"];
const MIN_COLUMN_WIDTH = 48;
const DETENT_ENTER = 7;
const DETENT_LEAVE = 14;
/* A delimiter row must contain a pipe — without that test, YAML frontmatter
   fences and `---` rules counted as tables and shifted every stored width. */
function isTableDelimiter(line) {
  return line.includes("|") && /^[\s|:-]+$/.test(line) && line.includes("-");
}

// Delimiter-row line numbers of the last few documents: every table in a
// note asks, and rescanning the note for each one was quadratic.
const delimiterCache = [];
function delimiterLines(text) {
  const hit = delimiterCache.find(entry => entry.text === text);
  if (hit) return hit.lines;
  const lines = [];
  text.split("\n").forEach((line, index) => { if (isTableDelimiter(line)) lines.push(index); });
  delimiterCache.unshift({ text, lines });
  delimiterCache.length = Math.min(delimiterCache.length, 3);
  return lines;
}

function tableOrdinal(text, lineStart) {
  const lines = delimiterLines(text);
  let low = 0, high = lines.length;
  while (low < high) { const mid = (low + high) >> 1; if (lines[mid] < lineStart) low = mid + 1; else high = mid; }
  return low;
}

function headerCells(table) {
  const row = table.querySelector("thead > tr") || table.querySelector("tr");
  return row ? [...row.children] : [];
}

function tableRows(table) {
  return [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
}

const MIN_ROW_HEIGHT = 24;

/* --------------------------------------------------------------------------
 * Table sizes as CSS rules
 *
 * Sizes are not written onto cells. Obsidian's Live Preview table widget calls
 * lockDimensions() and then removeAttribute("style") on the cell being edited,
 * which wipes any inline size, and it rebuilds its DOM freely. A stylesheet
 * keyed by a data attribute survives both: re-tagging a rebuilt table is
 * enough to bring its sizes back.
 * -------------------------------------------------------------------------- */

class TableSizeStyles {
  constructor() {
    this.el = document.createElement("style");
    this.el.id = "ibt-sizes";
    document.head.appendChild(this.el);
    this.sizes = new Map();
  }

  set(key, sizes, rowMap) {
    this.sizes.set(key, { sizes, rowMap });
    this.render();
  }

  render() {
    const rules = [];
    for (const [key, { sizes, rowMap }] of this.sizes) {
      const scope = `table[data-ibt-key="${key}"]`;
      // Auto table layout never lets a cell shrink below its content, so a
      // width is only a request there. Once every column has one, switch to a
      // fixed layout with an explicit total: then the widths are the law.
      const cols = sizes.cols || [];
      const count = sizes.columnCount || cols.length;
      if (count && cols.length >= count && cols.slice(0, count).every(Boolean)) {
        const total = cols.slice(0, count).reduce((sum, width) => sum + width, 0);
        rules.push(`${scope} { table-layout: fixed !important; width: ${total}px !important; min-width: 0 !important; max-width: none !important; }`);
      }
      cols.forEach((width, index) => {
        if (!width) return;
        rules.push(`${scope} > * > tr > :nth-child(${index + 1}) { width: ${width}px !important; min-width: ${width}px !important; max-width: ${width}px !important; }`);
      });
      (sizes.rows || []).forEach((height, index) => {
        if (!height || !rowMap?.[index]) return;
        rules.push(`${scope} > ${rowMap[index]} { height: ${height}px !important; }`);
      });
    }
    this.el.textContent = rules.join("\n");
  }

  destroy() {
    this.el.remove();
  }
}

function tableKey(path, ordinal) {
  let hash = 0;
  for (const char of `${path}#${ordinal}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `t${(hash >>> 0).toString(36)}`;
}

/* nth-child selectors for each row, so a row rule survives a DOM rebuild. */
function rowSelectors(table) {
  return tableRows(table).map(row => {
    const section = row.parentElement.tagName.toLowerCase();
    const index = [...row.parentElement.children].indexOf(row) + 1;
    return section === "table" ? `tr:nth-child(${index})` : `${section} > tr:nth-child(${index})`;
  });
}

/* --------------------------------------------------------------------------
 * Resize layer
 *
 * One absolutely positioned layer over the table carries every handle; cells
 * would clip them. Handles are kept and only moved — rebuilding mid-drag
 * destroyed the handle holding the pointer capture. A focus band shows exactly
 * which column or row a handle controls, on hover and throughout a drag.
 * -------------------------------------------------------------------------- */

class TableResizeLayer {
  constructor(table, options) {
    this.table = table;
    this.options = options;
    this.host = table.parentElement;
    if (!this.host) return;
    // Everything else waits for the first hover: a long note has dozens of
    // tables, and reading styles or geometry for each one at render time
    // forced a layout per table.
    this.onEnter = event => {
      // Live Preview updates the widget's DOM in place when the source is edited (a block's own
      // position control does), which can drop the layer from its host or move the <table> into a
      // new .table-wrapper. Put the layer back, or nobody can see or reach it again.
      const host = this.table.parentElement;
      if (this.built && host && (host !== this.host || !this.layer.isConnected)) {
        this.host = host;
        if (getComputedStyle(host).position === "static") host.classList.add("ibt-host");
        host.appendChild(this.layer);
      }
      if (!this.built) this.setup();
      else this.build();
      this.layer.classList.add("is-visible");
      // Touch has no hover: a tap shows only the position button and keeps it until the next tap elsewhere.
      if (event?.pointerType === "touch" && !this.touchOff) {
        this.layer.classList.add("is-touch");
        this.touchOff = outside => {
          if (this.layer.contains(outside.target) || this.table.contains(outside.target)) return;
          this.touchOff = null;
          document.removeEventListener("pointerdown", this.touchOffHandler, true);
          this.layer.classList.remove("is-visible", "is-touch");
        };
        this.touchOffHandler = this.touchOff;
        document.addEventListener("pointerdown", this.touchOffHandler, true);
      }
    };
    this.onLeave = event => {
      if (this.dragging || !this.layer || this.touchOff) return;
      if (this.layer.contains(event.relatedTarget) || this.table.contains(event.relatedTarget)) return;
      this.layer.classList.remove("is-visible");
      this.showFocus(null);
    };
    table.addEventListener("pointerenter", this.onEnter);
    table.addEventListener("pointerleave", this.onLeave);
  }

  setup() {
    this.built = true;
    if (getComputedStyle(this.host).position === "static") this.host.classList.add("ibt-host");
    this.layer = document.createElement("div");
    this.layer.className = "ibt-layer";
    this.focus = document.createElement("div");
    this.focus.className = "ibt-focus";
    this.readout = document.createElement("div");
    this.readout.className = "ibt-readout";
    this.layer.append(this.focus);
    document.body.appendChild(this.readout);
    this.host.appendChild(this.layer);
    this.options.alignmentControl?.(this.layer);
    this.mountSizeMenu();
    this.layer.addEventListener("pointerleave", this.onLeave);
    this.resizeObserver = new ResizeObserver(() => this.build());
    this.resizeObserver.observe(this.table);
    this.build();
  }

  /* One button for the quick sizing actions, beside the position button. */
  mountSizeMenu() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ibt-size";
    button.title = "表格尺寸";
    button.setAttribute("aria-label", "表格尺寸");
    setIcon(button, UI_ICONS.width);
    button.addEventListener("pointerdown", event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      const menu = new Menu();
      const add = (title, icon, run) => menu.addItem(item => item.setTitle(title).setIcon(icon).onClick(() => { this.build(); run(); }));
      add("所有列适应内容", "lucide-between-vertical-start", () => this.fitAll());
      add("等分列宽", "lucide-columns-3", () => this.equalize());
      add("撑满正文宽度", "lucide-move-horizontal", () => this.fillWidth());
      menu.addSeparator();
      add("所有行适应内容", "lucide-between-horizontal-start", () => this.autoRows());
      add("统一行高", "lucide-rows-3", () => this.equalizeRows());
      menu.addSeparator();
      add("重置列宽与行高", "lucide-rotate-ccw", () => this.resetAll());
      // Modifier keys and double-click hints only make sense with a mouse.
      if (!document.body.classList.contains("is-mobile")) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle("拖边线：吸附内容尺寸 · Alt 自由 · Shift 十像素").setIcon("lucide-info").setDisabled(true));
      menu.addItem(item => item.setTitle("双击边线：适应内容").setIcon("lucide-info").setDisabled(true));
      }
      const box = button.getBoundingClientRect();
      menu.showAtPosition({ x: box.left, y: box.bottom + 4 });
    });
    this.layer.appendChild(button);
  }

  alive() {
    // A table detached for an instant while the widget updates must keep its listeners: only the
    // stale sweep in attachTable decides a layer is really gone.
    if (!this.table.isConnected) return false;
    if (this.layer?.isConnected) return true;
    // Live Preview updates the widget in place when the source changes (a block's own position
    // control does that) and can drop the layer from its host while the table stays. Destroying it
    // here removed the hover listeners too, so the table kept its marker and could never be
    // attached again. Put the layer back instead.
    const host = this.table.parentElement;
    if (!host || !this.layer) return false;
    this.host = host;
    if (getComputedStyle(host).position === "static") host.classList.add("ibt-host");
    host.appendChild(this.layer);
    return true;
  }

  destroy() {
    this.cancelDrag?.();
    if (this.touchOffHandler) document.removeEventListener("pointerdown", this.touchOffHandler, true);
    this.resizeObserver?.disconnect();
    this.layer?.remove();
    this.readout?.remove();
    this.table.removeEventListener("pointerenter", this.onEnter);
    this.table.removeEventListener("pointerleave", this.onLeave);
  }

  geometry() {
    const rect = this.table.getBoundingClientRect();
    const cols = headerCells(this.table).map(cell => {
      const box = cell.getBoundingClientRect();
      return { start: box.left - rect.left, end: box.right - rect.left };
    });
    const rows = tableRows(this.table).map(row => {
      const box = row.getBoundingClientRect();
      return { start: box.top - rect.top, end: box.bottom - rect.top };
    });
    return { rect, cols, rows };
  }

  build() {
    if (!this.alive()) return;
    const hostRect = this.host.getBoundingClientRect();
    const { rect, cols, rows } = this.geometry();
    this.geo = { cols, rows, width: rect.width, height: rect.height };
    // Last widths seen while nothing was being edited: by the time an edit's
    // focus event arrives, the cell editor is already in and has widened its
    // column, so the hold must come from before that.
    if (!this.options.isHolding?.()) this.stableCols = cols.map(c => Math.round(c.end - c.start));
    Object.assign(this.layer.style, {
      left: `${rect.left - hostRect.left + this.host.scrollLeft}px`,
      top: `${rect.top - hostRect.top + this.host.scrollTop}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    const headerHeight = rows[0] ? rows[0].end - rows[0].start : 0;
    const firstWidth = cols[0] ? cols[0].end - cols[0].start : 0;
    this.layer.style.setProperty("--ibt-header-mid", `${headerHeight / 2}px`);
    this.layer.style.setProperty("--ibt-first-mid", `${Math.min(firstWidth / 2, 18)}px`);
    this.place("col", cols.map(c => c.end));
    this.place("row", rows.map(r => r.end));
    if (this.active) this.showFocus(this.active);
  }

  place(axis, edges) {
    const handles = [...this.layer.querySelectorAll(`.ibt-handle.is-${axis}`)];
    while (handles.length < edges.length) handles.push(this.addHandle(axis, handles.length));
    while (handles.length > edges.length) handles.pop().remove();
    handles.forEach((handle, index) => {
      handle.style[axis === "col" ? "left" : "top"] = `${edges[index]}px`;
    });
  }

  addHandle(axis, index) {
    const handle = document.createElement("div");
    handle.className = `ibt-handle is-${axis}`;
    handle.title = t(axis === "col" ? "resizeColumn" : "resizeRow");
    const target = { axis, index };
    handle.addEventListener("pointerenter", () => { if (!this.dragging) this.showFocus(target); });
    handle.addEventListener("pointerleave", () => { if (!this.dragging) this.showFocus(null); });
    handle.addEventListener("pointerdown", event => this.startDrag(event, axis, index, handle));
    handle.addEventListener("dblclick", event => {
      event.preventDefault();
      event.stopPropagation();
      // Like a spreadsheet: double-click a column edge to fit its widest text; a row edge returns to auto height.
      if (axis === "col") { this.options.seedColumns(this.geo.cols.map(c => Math.round(c.end - c.start))); this.options.resize("col", index, Math.max(MIN_COLUMN_WIDTH, this.measureFit(index))); this.options.commit(); }
      else this.options.reset(axis, index);
      this.build();
      this.pulse(handle);
    });
    this.layer.appendChild(handle);
    return handle;
  }

  /* The band over the column or row a handle resizes. */
  showFocus(target) {
    this.active = target;
    if (!target || !this.geo) {
      this.focus.classList.remove("is-visible");
      return;
    }
    const span = (target.axis === "col" ? this.geo.cols : this.geo.rows)[target.index];
    if (!span) return;
    Object.assign(this.focus.style, target.axis === "col"
      ? { left: `${span.start}px`, width: `${span.end - span.start}px`, top: "0px", height: `${this.geo.height}px` }
      : { top: `${span.start}px`, height: `${span.end - span.start}px`, left: "0px", width: `${this.geo.width}px` });
    this.focus.classList.add("is-visible");
  }

  /* The widest unwrapped content of a column, measured on a hidden one-column copy so it is the
     width the column needs to show every cell on one line. */
  measureFit(index) {
    const probe = document.createElement("table");
    probe.className = this.table.className.replace(/\bibt-[\w-]+/g, "").trim();
    probe.style.cssText = "position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:max-content;max-width:none;table-layout:auto;white-space:nowrap;margin:0";
    const body = probe.createTBody();
    for (const row of tableRows(this.table).slice(0, 120)) {
      const cell = row.children[index];
      if (!cell) continue;
      const clone = cell.cloneNode(true) as HTMLElement;
      clone.removeAttribute("colspan");
      clone.style.cssText = "width:auto;min-width:0;max-width:none;white-space:nowrap";
      body.insertRow().appendChild(clone);
    }
    this.host.appendChild(probe);
    const width = Math.ceil(probe.getBoundingClientRect().width);
    probe.remove();
    return Math.min(1600, width);
  }

  /* The height a row needs at its current column widths: its tallest cell's content plus that
     cell's own padding and borders. Reading the content with a Range ignores any height the row
     was stretched to, so it works after a row has been resized. */
  measureRowFit(index) {
    const row = tableRows(this.table)[index];
    if (!row) return MIN_ROW_HEIGHT;
    let tallest = 0;
    for (const cell of row.children) {
      const style = getComputedStyle(cell as Element);
      const range = document.createRange();
      range.selectNodeContents(cell);
      const content = range.getBoundingClientRect().height;
      // Collapsed borders are shared with the neighbouring rows, so each counts half.
      const extra = ["paddingTop", "paddingBottom"].reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0)
        + ["borderTopWidth", "borderBottomWidth"].reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0) / 2;
      tallest = Math.max(tallest, content + extra);
    }
    return Math.max(MIN_ROW_HEIGHT, Math.ceil(tallest));
  }

  // Every row to the tallest row's natural height.
  equalizeRows() {
    const heights = this.geo.rows.map((_, index) => this.measureRowFit(index));
    const tallest = Math.max(...heights, MIN_ROW_HEIGHT);
    this.geo.rows.forEach((_, index) => this.options.resize("row", index, tallest));
    this.options.commit();
    this.build();
    this.pulse(null);
  }

  autoRows() {
    this.geo.rows.forEach((_, index) => this.options.reset("row", index));
    this.options.commit();
    this.build();
    this.pulse(null);
  }

  currentWidths() { return this.geo.cols.map(c => Math.round(c.end - c.start)); }

  /* Apply a whole set of column widths at once (the quick actions). */
  setWidths(widths) {
    this.options.seedColumns(this.currentWidths());
    widths.forEach((width, index) => this.options.resize("col", index, Math.max(MIN_COLUMN_WIDTH, Math.round(width))));
    this.options.commit();
    this.build();
    this.pulse(null);
  }

  fitAll() { this.setWidths(this.geo.cols.map((_, index) => this.measureFit(index))); }

  equalize() {
    const total = this.currentWidths().reduce((sum, width) => sum + width, 0);
    this.setWidths(this.geo.cols.map(() => total / this.geo.cols.length));
  }

  // Scale the columns together so the table fills the text column.
  fillWidth() {
    const room = Math.floor(this.host.clientWidth);
    const widths = this.currentWidths(), total = widths.reduce((sum, width) => sum + width, 0);
    if (room > 0 && total > 0) this.setWidths(widths.map(width => width * room / total));
  }

  resetAll() {
    this.geo.cols.forEach((_, index) => this.options.reset("col", index));
    this.geo.rows.forEach((_, index) => this.options.reset("row", index));
    this.build();
  }

  // A short "thunk" when a drag catches a detent, so the stop is felt as well as seen.
  pulse(handle) {
    const targets = [this.layer, handle].filter(Boolean);
    targets.forEach(node => { node.classList.remove("is-detent"); void node.offsetWidth; node.classList.add("is-detent"); });
    window.setTimeout(() => targets.forEach(node => node.classList.remove("is-detent")), 320);
    try { navigator.vibrate?.(8); } catch (_) {}
  }

  startDrag(event, axis, index, handle) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const span = (axis === "col" ? this.geo.cols : this.geo.rows)[index];
    if (!span) return;

    // Seed every column from its rendered width, so the untouched columns do
    // not jump once widths start to be enforced.
    if (axis === "col") this.options.seedColumns(this.geo.cols.map(c => Math.round(c.end - c.start)));

    const start = axis === "col" ? event.clientX : event.clientY;
    const startSize = span.end - span.start;
    const min = axis === "col" ? MIN_COLUMN_WIDTH : MIN_ROW_HEIGHT;

    this.dragging = true;
    this.showFocus({ axis, index });
    handle.classList.add("is-dragging");
    this.layer.classList.add("is-visible", "is-dragging");
    document.body.classList.add(axis === "col" ? "ibt-dragging-col" : "ibt-dragging-row");
    try { handle.setPointerCapture(event.pointerId); } catch (_) {}

    let size = Math.round(startSize);
    let frame = 0;
    // Columns catch on two stops: the width that shows the widest cell on one line, and an equal share.
    const marks = axis === "col" ? [
      { value: Math.max(min, this.measureFit(index)), label: "适应内容" },
      { value: Math.max(min, Math.round(this.geo.width / this.geo.cols.length)), label: "等分宽度" }
    ] : [
      // Rows stop at their natural height, and at the tallest row's height (a uniform table).
      { value: Math.max(min, this.measureRowFit(index)), label: "适应内容" },
      { value: Math.max(min, ...this.geo.rows.map((_, i) => this.measureRowFit(i))), label: "与最高行一致" }
    ];
    let stuck = null;
    const render = () => {
      frame = 0;
      this.options.resize(axis, index, size);
      this.build();
      this.readout.textContent = `${axis === "col" ? "列宽" : "行高"} ${size} 像素${stuck ? ` · ${stuck.label}` : ""}`;
      const box = handle.getBoundingClientRect();
      this.readout.style.left = `${Math.max(80, Math.min(window.innerWidth - 80, box.left))}px`;
      this.readout.style.top = `${Math.max(36, Math.min(window.innerHeight - 36, box.top))}px`;
      this.readout.classList.add("is-visible");
    };
    const onMove = move => {
      const now = axis === "col" ? move.clientX : move.clientY;
      let target = Math.max(min, Math.round(startSize + now - start));
      if (move.altKey) stuck = null;                                   // Alt: free drag, no stops
      else if (move.shiftKey) { target = Math.max(min, Math.round(target / 10) * 10); stuck = null; } // Shift: 10px grid
      else {
        let caught = null;
        for (const mark of marks) {
          // Sticky: it takes a little more pull to leave a stop than it took to reach it.
          if (Math.abs(target - mark.value) <= (stuck === mark ? DETENT_LEAVE : DETENT_ENTER)) { caught = mark; break; }
        }
        if (caught) target = caught.value;
        if (caught !== stuck) { stuck = caught; if (caught) this.pulse(handle); }
      }
      size = target;
      if (!frame) frame = requestAnimationFrame(render);
    };
    const onUp = () => {
      this.cancelDrag = null;
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      if (frame) cancelAnimationFrame(frame);
      render();
      this.dragging = false;
      handle.classList.remove("is-dragging");
      this.layer.classList.remove("is-dragging");
      this.readout.classList.remove("is-visible");
      document.body.classList.remove("ibt-dragging-col", "ibt-dragging-row");
      this.options.commit();
      this.build();
    };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    this.cancelDrag = () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onUp, true);
      if (frame) cancelAnimationFrame(frame);
      this.dragging = false;
      document.body.classList.remove("ibt-dragging-col", "ibt-dragging-row");
      this.readout?.classList.remove("is-visible");
      this.cancelDrag = null;
    };
  }
}

const mermaidHighlighter = ViewPlugin.fromClass(class {
  constructor(view) {
    this.decorations = buildMermaidDecorations(view);
  }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildMermaidDecorations(update.view);
    }
  }
}, {
  decorations: value => value.decorations
});

/* Live Preview draws a code block line by line, so the reading-view header
   cannot be attached. A copy button sits on the opening fence line instead
   and reads the fenced lines straight from the document when pressed. */
const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;

function fencedSource(doc, openLine) {
  const opening = FENCE_OPEN.exec(doc.line(openLine).text);
  if (!opening) return null;
  const marker = opening[1];
  const closing = new RegExp(`^\\s*${marker[0] === "`" ? "`" : "~"}{${marker.length},}\\s*$`);
  const lines = [];
  for (let n = openLine + 1; n <= doc.lines; n += 1) {
    const text = doc.line(n).text;
    if (closing.test(text)) break;
    lines.push(text);
  }
  return lines.join("\n");
}

class CodeCopyWidget extends WidgetType {
  eq() { return true; }
  toDOM(view) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ibm-copy-source ibc-live-copy";
    button.title = t("copySource");
    button.setAttribute("aria-label", t("copySource"));
    setIcon(button, UI_ICONS.copy);
    // Keep the caret where it is: a click must not move into the fence line.
    button.addEventListener("mousedown", event => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const line = view.state.doc.lineAt(view.posAtDOM(button)).number;
        const source = fencedSource(view.state.doc, line);
        if (source === null) throw new Error("no fence");
        await navigator.clipboard.writeText(source);
        showCopyFeedback(button, t("copied"));
        new Notice(t("copied"));
      } catch (_) {
        new Notice(t("copyFailed"));
      }
    });
    const actions = document.createElement("span");
    actions.className = "ibc-live-actions";
    actions.appendChild(button);
    const align = document.createElement("button");
    align.type = "button"; align.className = "ibc-live-copy ibc-live-align";
    align.title = "代码块位置"; align.setAttribute("aria-label", "代码块位置");
    setIcon(align, UI_ICONS.alignCenter);
    align.addEventListener("mousedown", e => { e.preventDefault(); e.stopPropagation(); });
    align.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      const menu = new Menu();
      const line = () => view.state.doc.lineAt(view.posAtDOM(align));
      const current = line().text.match(/\{align=(left|center|right)\}/)?.[1] || "default";
      for (const [id, label] of [["default","跟随默认"],["left","居左"],["center","居中"],["right","居右"]]) menu.addItem(item => item.setTitle(label).setChecked(current === id).onClick(() => {
        const opening = line();
        if (!FENCE_OPEN.test(opening.text)) return;
        const clean = opening.text.replace(/\s*\{align=(?:left|center|right)\}/g, "").trimEnd();
        const insert = id === "default" ? clean : `${clean} {align=${id}}`;
        if (insert !== opening.text) {
          holdScrollPosition(align);
          replaceOffsetsQuietly(view, opening.from, opening.to, insert);
        }
      }));
      const box = align.getBoundingClientRect(); menu.showAtPosition({x:box.left,y:box.bottom+4});
    });
    actions.appendChild(align);
    return actions;
  }
  ignoreEvent() { return true; }
}

// The language icon at the left of a Live Preview code header, opposite the copy and position buttons.
class CodeLanguageIconWidget extends WidgetType {
  constructor(readonly language: string) { super(); }
  eq(other) { return other.language === this.language; }
  toDOM() {
    const holder = document.createElement("span");
    holder.className = "ibc-live-lang";
    holder.setAttribute("contenteditable", "false");
    holder.appendChild(createLanguageIcon(this.language));
    return holder;
  }
  ignoreEvent() { return true; }
}

// Line numbers come from the document, not the DOM: the editor only renders visible lines, so
// counting rendered lines would restart at 1 whenever a block's opening fence scrolls away.
class CodeLineNumberWidget extends WidgetType {
  constructor(readonly number: number) { super(); }
  eq(other) { return other.number === this.number; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "ibc-live-ln";
    span.textContent = String(this.number);
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent() { return true; }
}

function buildCopyDecorations(view) {
  const ranges = [];
  const doc = view.state.doc;
  let open = null, numbered = false, count = 0;
  for (let n = 1; n <= doc.lines; n += 1) {
    const text = doc.line(n).text;
    if (!open) {
      const m = FENCE_OPEN.exec(text);
      if (!m) continue;
      open = m[1];
      numbered = !/^(?:mermaid|echarts)$/i.test(m[2]);
      count = 0;
      // Mermaid renders as a diagram with its own header.
      if (!/^mermaid$/i.test(m[2])) {
        ranges.push(Decoration.widget({ widget: new CodeLanguageIconWidget(m[2]), side: 1 }).range(doc.line(n).to));
        ranges.push(Decoration.widget({ widget: new CodeCopyWidget(), side: 1 }).range(doc.line(n).to));
      }
    } else if (new RegExp(`^\\s*${open[0] === "`" ? "`" : "~"}{${open.length},}\\s*$`).test(text)) {
      open = null;
    } else if (numbered) {
      count += 1;
      ranges.push(Decoration.widget({ widget: new CodeLineNumberWidget(count), side: -1 }).range(doc.line(n).from));
    }
  }
  return Decoration.set(ranges, true);
}

const codeCopyButtons = ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = buildCopyDecorations(view); }
  update(update) {
    if (update.docChanged) this.decorations = buildCopyDecorations(update.view);
  }
}, { decorations: value => value.decorations });

// Obsidian's own language flair copies the code when clicked; make it a language picker instead.
function installCodeLanguagePicker(plugin) {
  const flairOf = event => event.target instanceof Element ? event.target.closest(".cm-editor .code-block-flair") : null;
  plugin.registerDomEvent(document, "mousedown", event => { if (flairOf(event)) event.preventDefault(); }, true);
  plugin.registerDomEvent(document, "mouseover", event => {
    const flair = flairOf(event);
    if (flair && flair.getAttribute("aria-label") !== "更改语言") flair.setAttribute("aria-label", "更改语言");
  }, true);
  plugin.registerDomEvent(document, "click", event => {
    const flair = flairOf(event);
    if (!flair) return;
    const cm = plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view?.editor?.cm).find(cm => cm?.dom.contains(flair));
    if (!cm) return;
    event.preventDefault(); event.stopImmediatePropagation();
    let line;
    try { line = cm.state.doc.lineAt(cm.posAtDOM(flair)); } catch (_) { return; }
    if (!FENCE_OPEN.test(line.text)) return;
    openLanguagePicker({
      anchor: flair,
      current: fenceLanguage(line.text),
      onPick: language => {
        const now = cm.state.doc.lineAt(Math.min(line.from, cm.state.doc.length));
        if (!FENCE_OPEN.test(now.text)) return;
        const next = withFenceLanguage(now.text, language);
        if (next === now.text) return;
        holdScrollPosition(flair);
        replaceOffsetsQuietly(cm, now.from, now.to, next);
      }
    });
  }, true);
}

function installQuietTaskToggle(plugin) {
  const checkbox = event => event.target instanceof Element
    ? event.target.closest(".cm-scroller input.task-list-item-checkbox") : null;
  plugin.registerDomEvent(document, "mousedown", event => {
    if (checkbox(event)) event.preventDefault();
  }, true);
  plugin.registerDomEvent(document, "click", event => {
    const input = checkbox(event);
    if (!input) return;
    const view = plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view)
      .find(view => view.editor?.cm?.dom.contains(input));
    const cm = view?.editor?.cm;
    if (!cm) return;
    let line;
    try { line = cm.state.doc.lineAt(cm.posAtDOM(input)); } catch (_) { return; }
    const marker = /^(\s*(?:[-+*]|\d+[.)])\s+\[)([^\]])\]/.exec(line.text);
    if (!marker) return;
    event.preventDefault(); event.stopImmediatePropagation();
    holdScrollPosition(input);
    const offset = line.from + marker[1].length;
    replaceOffsetsQuietly(cm, offset, offset + 1, marker[2] === " " ? "x" : " ");
  }, true);
}

const writingModeRefresh = StateEffect.define();

function buildWritingFocusDecorations(view, enabled) {
  if (!enabled) return Decoration.none;
  const doc = view.state.doc;
  const cursorLine = doc.lineAt(view.state.selection.main.head).number;
  let paragraphStart = cursorLine;
  let paragraphEnd = cursorLine;
  while (paragraphStart > 1 && doc.line(paragraphStart - 1).text.trim()) paragraphStart -= 1;
  while (paragraphEnd < doc.lines && doc.line(paragraphEnd + 1).text.trim()) paragraphEnd += 1;

  const ranges = [];
  let lastLine = 0;
  for (const visible of view.visibleRanges) {
    const first = doc.lineAt(visible.from).number;
    const last = doc.lineAt(visible.to).number;
    for (let number = first; number <= last; number += 1) {
      if (number <= lastLine) continue;
      lastLine = number;
      if (number < paragraphStart || number > paragraphEnd) {
        ranges.push(Decoration.line({ class: "ib-writing-dim" }).range(doc.line(number).from));
      }
    }
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

function writingModesExtension(plugin) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = buildWritingFocusDecorations(view, Boolean(plugin.state?.writingModes?.focusMode));
      this.frame = 0;
    }

    update(update) {
      const modeChanged = update.transactions.some(transaction =>
        transaction.effects.some(effect => effect.is(writingModeRefresh))
      );
      if (update.docChanged || update.selectionSet || update.viewportChanged || modeChanged) {
        this.decorations = buildWritingFocusDecorations(update.view, Boolean(plugin.state?.writingModes?.focusMode));
      }
      // Pointer selection must not move the document under the dragging mouse.
      const pointerSelection = update.transactions.some(transaction => transaction.isUserEvent("select.pointer"));
      const caretOnly = update.state.selection.ranges.length === 1 && update.state.selection.main.empty;
      if (this.frame && (!caretOnly || pointerSelection)) {
        window.cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
      if (plugin.state?.writingModes?.typewriterScroll && caretOnly && !pointerSelection && (update.docChanged || update.selectionSet || modeChanged)) {
        this.centerCursor(update.view);
      }
    }

    centerCursor(view) {
      if (this.frame) window.cancelAnimationFrame(this.frame);
      this.frame = window.requestAnimationFrame(() => {
        this.frame = 0;
        if (!view.dom.isConnected || plugin.app.workspace.activeLeaf?.view?.editor?.cm !== view
          || view.state.selection.ranges.length !== 1 || !view.state.selection.main.empty
          || !plugin.state?.writingModes?.typewriterScroll) return;
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: "center", yMargin: 0 }) });
      });
    }

    destroy() {
      if (this.frame) window.cancelAnimationFrame(this.frame);
    }
  }, { decorations: value => value.decorations });
}

function setWritingMode(plugin, mode, value) {
  plugin.state.writingModes ||= writingModeDefaults();
  plugin.state.writingModes[mode] = Boolean(value);
  plugin.saveStoredState();
  plugin.app.workspace.iterateAllLeaves(leaf => {
    const cm = leaf.view?.editor?.cm;
    if (cm?.dispatch) cm.dispatch({ effects: writingModeRefresh.of(null) });
  });
  document.querySelectorAll(".ibp-toolbar").forEach(toolbar => toolbar.dispatchEvent(new CustomEvent("ibp-refresh")));
}

function toggleWritingMode(plugin, mode) {
  const current = Boolean(plugin.state.writingModes?.[mode]);
  setWritingMode(plugin, mode, !current);
  const label = mode === "typewriterScroll" ? "打字机滚动" : "专注模式";
  new Notice(`${label}已${current ? "关闭" : "开启"}`);
}


export {
  installCodeLanguagePicker,
  DENSITIES,
  MIN_COLUMN_WIDTH,
  isTableDelimiter,
  tableOrdinal,
  headerCells,
  tableRows,
  MIN_ROW_HEIGHT,
  TableSizeStyles,
  tableKey,
  rowSelectors,
  TableResizeLayer,
  mermaidHighlighter,
  FENCE_OPEN,
  fencedSource,
  CodeCopyWidget,
  buildCopyDecorations,
  codeCopyButtons,
  installQuietTaskToggle,
  writingModeRefresh,
  buildWritingFocusDecorations,
  writingModesExtension,
  setWritingMode,
  toggleWritingMode,
  writingModeDefaults
};
