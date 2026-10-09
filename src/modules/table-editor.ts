import { editTableLines, findPipeTableAtLine, parsePipeRow, type TableEditAction, type PipeTableRange } from "./table-edit.js";

const { EditorSelection, Prec } = require("@codemirror/state");
const { EditorView, keymap } = require("@codemirror/view");

// Row / column editing is Obsidian's own (editor:table-*). Only CJK-aware
// width formatting is added here; Tab / Enter navigation covers source mode,
// where Obsidian's table widget does not apply.
export const TABLE_COMMANDS: Array<{ action: TableEditAction; name: string }> = [
  { action: "format", name: "格式化当前表格（中英文宽度对齐）" }
];

function tableAtCursor(view): { range: PipeTableRange; rowIndex: number; columnIndex: number; columnCount: number } | null {
  const doc = view.state.doc;
  const cursor = view.state.selection.main;
  if (!cursor.empty) return null;
  const line = doc.lineAt(cursor.head);
  const allLines = doc.toString().split("\n");
  const range = findPipeTableAtLine(allLines, line.number - 1);
  if (!range) return null;
  const rowIndex = line.number - 1 - range.startLine;
  if (rowIndex === 1) return null;
  const cells = parsePipeRow(line.text);
  if (!cells?.length) return null;
  let columnIndex = cells.findIndex(cell => cursor.head - line.from >= cell.start && cursor.head - line.from <= cell.end);
  if (columnIndex < 0) {
    const local = cursor.head - line.from;
    columnIndex = cells.findIndex(cell => local < cell.start);
    if (columnIndex < 0) columnIndex = cells.length - 1;
  }
  return { range, rowIndex, columnIndex, columnCount: cells.length };
}

function cellOffset(lines: string[], rowIndex: number, columnIndex: number) {
  const cells = parsePipeRow(lines[rowIndex] || "");
  if (!cells?.length) return 0;
  const column = Math.max(0, Math.min(columnIndex, cells.length - 1));
  let offset = 0;
  for (let row = 0; row < rowIndex; row += 1) offset += lines[row].length + 1;
  return offset + cells[column].start;
}

function replaceTable(view, range: PipeTableRange, action: TableEditAction, rowIndex: number, columnIndex: number) {
  const result = editTableLines(range.lines, action, rowIndex, columnIndex);
  if (!result) return false;
  const doc = view.state.doc;
  const from = doc.line(range.startLine + 1).from;
  const to = doc.line(range.endLine + 1).to;
  const insert = result.lines.join("\n");
  const cursor = from + cellOffset(result.lines, result.rowIndex, result.columnIndex);
  view.dispatch({
    changes: { from, to, insert },
    selection: EditorSelection.cursor(cursor),
    scrollIntoView: true,
    userEvent: "input"
  });
  return true;
}

export function applyTableEdit(view, action: TableEditAction) {
  if (!view?.state?.facet(EditorView.editable)) return false;
  const table = tableAtCursor(view);
  if (!table) return false;
  return replaceTable(view, table.range, action, table.rowIndex, table.columnIndex);
}

export function canEditTable(view) {
  return Boolean(view?.state?.facet(EditorView.editable) && tableAtCursor(view));
}

function moveToCell(view, range: PipeTableRange, rowIndex: number, columnIndex: number) {
  const lineText = range.lines[rowIndex];
  const cells = lineText && parsePipeRow(lineText);
  if (!cells?.length) return false;
  const column = Math.max(0, Math.min(columnIndex, cells.length - 1));
  const from = view.state.doc.line(range.startLine + 1).from;
  view.dispatch({
    selection: EditorSelection.cursor(from + cellOffset(range.lines, rowIndex, column)),
    scrollIntoView: true
  });
  return true;
}

function moveAcrossCells(view, direction: -1 | 1) {
  if (!view?.state?.facet(EditorView.editable)) return false;
  const table = tableAtCursor(view);
  if (!table) return false;
  const rows = [0, ...table.range.lines.map((_, index) => index).filter(index => index >= 2)];
  const current = rows.indexOf(table.rowIndex);
  if (current < 0) return false;
  const absoluteIndex = current * table.columnCount + table.columnIndex + direction;
  const cellTotal = rows.length * table.columnCount;
  if (absoluteIndex < 0) return false;
  if (absoluteIndex >= cellTotal) {
    const lastRow = table.range.lines.length - 1;
    return replaceTable(view, table.range, "row-add-below", lastRow, 0);
  }
  const targetRow = rows[Math.floor(absoluteIndex / table.columnCount)];
  const targetColumn = absoluteIndex % table.columnCount;
  return moveToCell(view, table.range, targetRow, targetColumn);
}

function moveToNextRow(view) {
  if (!view?.state?.facet(EditorView.editable)) return false;
  const table = tableAtCursor(view);
  if (!table) return false;
  const nextRow = table.rowIndex === 0 ? 2 : table.rowIndex + 1;
  if (nextRow < table.range.lines.length) return moveToCell(view, table.range, nextRow, table.columnIndex);
  return replaceTable(view, table.range, "row-add-below", table.rowIndex, table.columnIndex);
}

export const tableEditorExtension = Prec.highest(keymap.of([
  { key: "Tab", run: view => moveAcrossCells(view, 1) },
  { key: "Shift-Tab", run: view => moveAcrossCells(view, -1) },
  { key: "Enter", run: moveToNextRow }
]));
