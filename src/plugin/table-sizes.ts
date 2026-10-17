import { MarkdownView } from "obsidian";
import { TableResizeLayer,headerCells,rowSelectors,tableKey,tableOrdinal } from "../modules/editor-tools.js";
import { tableAlignmentControl } from "../modules/table-alignment.js";
import type { IgnorancePlugin } from "../plugin-types.js";

/* Table enhancements: remembered column widths and row heights, and the live-preview table tools. */

/* Stored sizes per table: { cols: [px|null…], rows: [px|null…] }. Older
   versions stored a bare array of column widths. */
export function storedSizes(plugin: IgnorancePlugin, path: string, ordinal) {
  const raw = plugin.state.tables?.[path]?.[ordinal];
  if (!raw) return { cols: [], rows: [] };
  if (Array.isArray(raw)) return { cols: raw, rows: [] };
  return { cols: raw.cols || [], rows: raw.rows || [] };
}

export function storeSizes(plugin: IgnorancePlugin, path: string, ordinal, sizes) {
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

export function enhanceTables(plugin: IgnorancePlugin, root: HTMLElement, context) {
  for (const table of root.querySelectorAll("table")) {
    if (table.closest(".cm-table-widget")) continue; // Live Preview is handled separately
    const info = context?.getSectionInfo?.(table);
    const path = context?.sourcePath;
    const ordinal = info && path ? tableOrdinal(info.text, info.lineStart) : null;
    plugin.attachTable(table, path, ordinal);
  }
}

/* Live Preview tables are CodeMirror widgets: no post-processor sees them,
   and the widget may rebuild its <table> at any time. Locate the table in
   the source through the editor, then attach as for reading view. */
export function enhanceLiveTable(plugin: IgnorancePlugin, table) {
  const widget = table.closest(".cm-table-widget");
  if (!widget) return;
  let path: string = null, ordinal = null;
  plugin.app.workspace.iterateAllLeaves?.(leaf => {
    const view = leaf.view;
    if (path || !(view instanceof MarkdownView) || !view.containerEl.contains(widget)) return;
    const cm = view.editor?.cm;
    try {
      const line = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
      path = view.file?.path ?? null;
      // Same count as reading view: delimiter rows above the table's first line.
      ordinal = tableOrdinal(cm.state.doc.toString(), line);
    } catch (_) {}
  });
  plugin.attachTable(table, path, ordinal);
}

export function attachTable(plugin: IgnorancePlugin, table, path: string, ordinal: number) {
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
  let hold: number[] = null;
  const publish = () => plugin.tableStyles.set(key, {
    cols: hold ? hold.map((width: number, index: number) => sizes.cols[index] || width) : sizes.cols,
    rows: sizes.rows,
    columnCount: headerCells(table).length
  }, rowSelectors(table));
  publish();

  const widget = table.closest(".cm-table-widget");
  if (widget && !widget.dataset.ibtHold) {
    widget.dataset.ibtHold = "1";
    // A click that starts an edit lands here first, before the editor exists.
    widget.addEventListener("pointerdown", () => {
      const current = widget.querySelector("table.ibt-enhanced");
      if (!hold && current) widget.ibtStable = headerCells(current).map(cell => Math.round(cell.getBoundingClientRect().width));
    }, true);
    widget.addEventListener("focusin", () => {
      const current = widget.querySelector("table.ibt-enhanced");
      if (hold || !current) return;
      hold = widget.ibtLayer?.stableCols || widget.ibtStable
        || headerCells(current).map(cell => Math.round(cell.getBoundingClientRect().width));
      widget.classList.add("ibt-holding");
      publish();
    });
    widget.addEventListener("focusout", event => {
      if (widget.contains(event.relatedTarget)) return;
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
    resize: (axis: string, index: number, size) => {
      (axis === "col" ? sizes.cols : sizes.rows)[index] = size;
      publish();
    },
    reset: (axis: string, index: number) => {
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
