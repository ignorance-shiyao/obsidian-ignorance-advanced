import { enhancementOn, handledByOther } from "../modules/enhancement-gate.js";
import { MarkdownView } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import { TableResizeLayer,headerCells,rowSelectors,tableKey,tableOrdinal } from "../modules/editor-tools.js";
import { tableAlignmentControl } from "../modules/table-alignment.js";
import type { IgnorancePlugin } from "../plugin-types.js";

/* Table enhancements: remembered column widths and row heights, and the live-preview table tools. */

/* Stored sizes per table: { cols: [px|null…], rows: [px|null…] }. Older
   versions stored a bare array of column widths. */
export interface StoredSizes {
  cols: (number | null)[];
  rows: (number | null)[];
}

/* A stored list of pixel sizes; anything that is not a number reads as "no size". */
function sizeList(value: unknown): (number | null)[] {
  return Array.isArray(value) ? value.map((entry: unknown) => typeof entry === "number" ? entry : null) : [];
}

/* The widget element Live Preview wraps a table in, with the state this module hangs on it. */
interface TableWidget extends HTMLElement {
  ibtStable?: number[];
  ibtLayer?: TableResizeLayer;
}

export function storedSizes(plugin: IgnorancePlugin, path: string, ordinal: number | string): StoredSizes {
  const raw: unknown = plugin.state.tables?.[path]?.[ordinal];
  if (!raw) return { cols: [], rows: [] };
  if (Array.isArray(raw)) return { cols: sizeList(raw), rows: [] };
  const record = raw as Record<string, unknown>;
  return { cols: sizeList(record.cols), rows: sizeList(record.rows) };
}

export function storeSizes(plugin: IgnorancePlugin, path: string, ordinal: number | string | null, sizes: StoredSizes) {
  if (path == null || ordinal === null) return;
  if (!plugin.state.tables[path]) plugin.state.tables[path] = {};
  const empty = !sizes.cols.some(Boolean) && !sizes.rows.some(Boolean);
  if (empty) {
    delete plugin.state.tables[path][ordinal];
    if (!Object.keys(plugin.state.tables[path]).length) delete plugin.state.tables[path];
  } else {
    plugin.state.tables[path][ordinal] = { cols: sizes.cols, rows: sizes.rows };
  }
  plugin.saveStoredState();
}

export function enhanceTables(plugin: IgnorancePlugin, root: HTMLElement, context: MarkdownPostProcessorContext | null) {
  if (!enhancementOn(plugin, "tables", root, context?.frontmatter)) return;
  for (const table of root.querySelectorAll<HTMLTableElement>("table")) {
    if (table.closest(".cm-table-widget") || handledByOther("tables", table)) continue; // Live Preview is handled separately
    const info = context?.getSectionInfo?.(table);
    const path = context?.sourcePath;
    const ordinal = info && path ? tableOrdinal(info.text, info.lineStart) : null;
    plugin.attachTable(table, path, ordinal);
  }
}

/* Live Preview tables are CodeMirror widgets: no post-processor sees them,
   and the widget may rebuild its <table> at any time. Locate the table in
   the source through the editor, then attach as for reading view. */
export function enhanceLiveTable(plugin: IgnorancePlugin, table: HTMLTableElement) {
  const widget = table.closest<HTMLElement>(".cm-table-widget");
  if (!widget || !enhancementOn(plugin, "tables", widget)) return;
  let path: string | null = null, ordinal: number | null = null;
  plugin.app.workspace.iterateAllLeaves?.(leaf => {
    const view = leaf.view;
    if (path || !(view instanceof MarkdownView) || !view.containerEl.contains(widget)) return;
    const cm = view.editor?.cm;
    if (!cm) return;
    try {
      const line = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
      path = view.file?.path ?? null;
      // Same count as reading view: delimiter rows above the table's first line.
      ordinal = tableOrdinal(cm.state.doc.toString(), line);
    } catch { /* the widget is not mounted in this editor */ }
  });
  plugin.attachTable(table, path, ordinal);
}

/** Takes the column and row handles off every table (the saved sizes stay in the notes' data). */
export function releaseTableLayers(plugin: IgnorancePlugin) {
  for (const layer of plugin.tableLayers) { layer.table.classList.remove("ibt-enhanced"); delete layer.table.dataset.ibtKey; layer.destroy(); }
  plugin.tableLayers.clear();
  document.querySelectorAll(".ibp-table-anchor").forEach(anchor => anchor.remove());
}

export function attachTable(plugin: IgnorancePlugin, table: HTMLTableElement, path: string | null, ordinal: number | null) {
  if (table.classList.contains("ibt-enhanced")) return;
  if (headerCells(table).length < 1) return;
  table.classList.add("ibt-enhanced");

  const keyed = path != null && ordinal !== null && ordinal >= 0;
  const key = keyed ? tableKey(path, ordinal) : `tmp${Math.random().toString(36).slice(2, 8)}`;
  table.dataset.ibtKey = key;
  const sizes = keyed ? plugin.storedSizes(path, ordinal) : { cols: [], rows: [] };
  // While a Live Preview cell is being edited, every column is held at the
  // width it had when editing began. The hold is a stylesheet rule like the
  // stored sizes, so Obsidian clearing the cell's inline style cannot undo it.
  let hold: number[] | null = null;
  const publish = () => plugin.tableStyles.set(key, {
    cols: hold ? hold.map((width: number, index: number) => sizes.cols[index] || width) : sizes.cols,
    rows: sizes.rows,
    columnCount: headerCells(table).length
  }, rowSelectors(table));
  publish();

  const widget = table.closest<TableWidget>(".cm-table-widget");
  if (widget && !widget.dataset.ibtHold) {
    widget.dataset.ibtHold = "1";
    // A click that starts an edit lands here first, before the editor exists.
    widget.addEventListener("pointerdown", () => {
      const current = widget.querySelector<HTMLTableElement>("table.ibt-enhanced");
      if (!hold && current) widget.ibtStable = headerCells(current).map(cell => Math.round(cell.getBoundingClientRect().width));
    }, true);
    widget.addEventListener("focusin", () => {
      const current = widget.querySelector<HTMLTableElement>("table.ibt-enhanced");
      if (hold || !current) return;
      hold = widget.ibtLayer?.stableCols || widget.ibtStable
        || headerCells(current).map(cell => Math.round(cell.getBoundingClientRect().width));
      widget.classList.add("ibt-holding");
      publish();
    });
    widget.addEventListener("focusout", event => {
      if (event.relatedTarget instanceof Node && widget.contains(event.relatedTarget)) return;
      hold = null;
      widget.classList.remove("ibt-holding");
      publish();
    });
  }

  const layer = new TableResizeLayer(table, {
    alignmentControl: tableAlignmentControl(plugin, table, path, ordinal),
    isHolding: () => Boolean(hold),
    seedColumns: (widths: number[]) => {
      widths.forEach((width: number, index: number) => { if (!sizes.cols[index]) sizes.cols[index] = width; });
    },
    resize: (axis: "col" | "row", index: number, size: number) => {
      (axis === "col" ? sizes.cols : sizes.rows)[index] = size;
      publish();
    },
    reset: (axis: "col" | "row", index: number) => {
      (axis === "col" ? sizes.cols : sizes.rows)[index] = null;
      publish();
      if (keyed) plugin.storeSizes(path, ordinal, sizes);
    },
    commit: () => { if (keyed) plugin.storeSizes(path, ordinal, sizes); }
  });
  // Re-renders replace tables without notice; drop layers left detached.
  // Post-processed tables may not be in the document yet, so only a layer
  // seen connected before counts as stale.
  for (const stale of plugin.tableLayers) {
    if (stale.table.isConnected) stale.seenConnected = true;
    else if (stale.seenConnected) {
      // Drop the marker too: if CodeMirror puts this same <table> back, it must be attached again.
      stale.table.classList.remove("ibt-enhanced");
      stale.destroy();
      plugin.tableLayers.delete(stale);
    }
  }
  plugin.tableLayers.add(layer);
  if (widget) widget.ibtLayer = layer;
}
