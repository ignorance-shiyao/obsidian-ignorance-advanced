/* Sorting and copying for Reading-view tables. Pure functions; the DOM side is table-sort.ts. */
export type SortDirection = "asc" | "desc";

const NUMBER = /^[+\-−]?[¥$€£]?\s*\d[\d,]*(?:\.\d+)?\s*%?$/;
const DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;

function numberValue(text: string): number | null {
  const clean = text.trim();
  if (!NUMBER.test(clean)) return null;
  const negative = /^[-−]/.test(clean);
  const value = Number(clean.replace(/[^\d.]/g, ""));
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

function dateValue(text: string): number | null {
  const match = DATE.exec(text.trim());
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(time) ? null : time;
}

const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

/** The new row order for one column: numbers, then dates, otherwise text. Empty cells always go last; ties keep their order. */
export function sortedOrder(cells: string[], direction: SortDirection): number[] {
  const filled = cells.map((text, index) => ({ text: text.trim(), index })).filter(item => item.text !== "");
  const empty = cells.map((text, index) => ({ text, index })).filter(item => item.text.trim() === "").map(item => item.index);
  const numbers = filled.map(item => numberValue(item.text));
  const dates = filled.map(item => dateValue(item.text));
  const compare: (a: number, b: number) => number = numbers.every(value => value !== null)
    ? (a, b) => (numbers[a]) - (numbers[b])
    : dates.every(value => value !== null)
      ? (a, b) => (dates[a]) - (dates[b])
      : (a, b) => collator.compare(filled[a].text, filled[b].text);
  const positions = filled.map((_, position) => position);
  positions.sort((a, b) => (direction === "asc" ? 1 : -1) * compare(a, b) || a - b);
  return [...positions.map(position => filled[position].index), ...empty];
}

export function rowsToTsv(rows: string[][]): string {
  return rows.map(row => row.map(cell => cell.replace(/[\t\r\n]+/g, " ").trim()).join("\t")).join("\n");
}

export function rowsToCsv(rows: string[][]): string {
  const quote = (cell: string) => /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return "﻿" + rows.map(row => row.map(cell => quote(cell.replace(/\r?\n/g, " ").trim())).join(",")).join("\r\n");
}

/** Reorders the body rows of a table's Markdown source. Returns null when the lines are not a plain pipe table of `count` rows. */
export function reorderTableLines(lines: string[], order: number[]): string[] | null {
  if (lines.length !== order.length + 2 || !lines.every(line => line.trim().startsWith("|"))) return null;
  if (!/^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1]) || new Set(order).size !== order.length) return null;
  if (order.some(index => !Number.isInteger(index) || index < 0 || index >= order.length)) return null;
  const body = lines.slice(2);
  return [lines[0], lines[1], ...order.map(index => body[index])];
}
