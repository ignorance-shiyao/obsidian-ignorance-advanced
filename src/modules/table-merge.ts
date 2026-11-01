import { enhancementOn, handledByOther } from "./enhancement-gate.js";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
/* Table extras in Reading view and exports (plain Markdown tables, nothing changes in the file):
     - a cell holding only `<` joins the cell on its left, one holding only `^` joins the cell above
     - a cell holding only `[ ]` / `[x]` shows an empty or ticked box
     - in a right-aligned column (`---:`) long integers get thousands separators and `72%` draws a bar
     - a first cell starting with `>` makes the row a child of the row above; parents fold and unfold their children
   VLOOK's table syntax works too:
     - `==` joins the cell on its left and `:` the cell above
     - a header that is wholly bold, italic or highlighted formats its column; a struck-through header hides the column
     - a header containing `[ ]` turns its column into checkboxes: `Y`, `N`, `?`, `[x]`, `[-]` or empty
     - in a right-aligned column, signed numbers are coloured and `¥ 12` / `$ 3` show their currency apart
     - a row or column left wholly empty becomes a gap that sets totals apart */
export interface MergePlan { row: number; col: number; colspan: number; rowspan: number }

/** Work out which cells absorb their `<` / `^` neighbours. Returns the surviving cells that span more than one slot,
 *  and the grid positions that disappear. */
export function planMerges(grid: string[][]) {
  const owner: Array<Array<[number, number]>> = grid.map((cells, row) => cells.map((_, col) => [row, col] as [number, number]));
  const reach = new Map<string, { row: number; col: number }>();
  const key = (row: number, col: number) => `${row},${col}`;
  const removed = new Set<string>();
  grid.forEach((cells, row) => cells.forEach((text, col) => {
    const mark = text.trim();
    let target: [number, number] | null = null;
    if ((mark === "<" || mark === "==") && col > 0) target = owner[row][col - 1];
    else if ((mark === "^" || mark === ":") && row > 0 && col < grid[row - 1].length) target = owner[row - 1][col];
    if (!target) return;
    owner[row][col] = target;
    removed.add(key(row, col));
    const entry = reach.get(key(target[0], target[1])) || { row: target[0], col: target[1] };
    entry.row = Math.max(entry.row, row);
    entry.col = Math.max(entry.col, col);
    reach.set(key(target[0], target[1]), entry);
  }));
  const merges: MergePlan[] = [...reach.entries()].map(([id, end]) => {
    const [row, col] = id.split(",").map(Number);
    return { row, col, colspan: end.col - col + 1, rowspan: end.row - row + 1 };
  });
  return { merges, removed };
}

const CHECK = /^\[( |x|X)\]$/;
const CHECK_HEADER = /\[ ?\] ?/;

/** A cell of a `[ ]` column: Y / [x] ticked, ? / [-] partly, N / [ ] / empty unticked; anything else is left alone. */
export function checkboxState(text: string): { state: "yes" | "no" | "partial"; rest: string } | null {
  const match = /^\s*(\[[xX -]\]|[YyNn?？])(?:\s+(.*))?$/s.exec(text);
  if (!match) return text.trim() ? null : { state: "no", rest: "" };
  const mark = match[1].toLowerCase();
  const state = mark === "y" || mark === "[x]" ? "yes" : mark === "?" || mark === "？" || mark === "[-]" ? "partial" : "no";
  return { state, rest: match[2] || "" };
}

/** `+12.5` / `-3%` / `¥ -8`: the sign, and a currency of up to three characters before a space. */
export function numberParts(text: string): { sign: "positive" | "negative" | null; currency: string | null } | null {
  const match = /^\s*(?:(\S{1,3}) )?([+-]?)\d[\d,]*(?:\.\d+)?%?\s*$/.exec(text);
  if (!match || (match[1] && /\d/.test(match[1]))) return null;
  return { sign: match[2] === "+" ? "positive" : match[2] === "-" ? "negative" : null, currency: match[1] || null };
}

/** Rows and columns whose cells are all empty (the header row counts for columns). */
export function blankLines(grid: string[][]) {
  const empty = (text: string | undefined) => !(text || "").trim();
  const rows = grid.map((cells, row) => row > 0 && cells.length > 0 && cells.every(empty) ? row : -1).filter(row => row >= 0);
  const width = Math.max(0, ...grid.map(cells => cells.length));
  const cols: number[] = [];
  for (let col = 0; col < width; col++) if (grid.length > 1 && grid.every(cells => empty(cells[col]))) cols.push(col);
  return { rows, cols };
}

export function enhanceTable(table: HTMLTableElement) {
  if (table.dataset.ibTableDone) return;
  table.dataset.ibTableDone = "1";
  const rows = [...table.rows];
  const grid = rows.map(row => [...row.cells].map(cell => cell.textContent || ""));
  const { merges, removed } = planMerges(grid);
  if (merges.length) {
    for (const { row, col, colspan, rowspan } of merges) {
      const cell = rows[row].cells[col];
      if (colspan > 1) cell.colSpan = colspan;
      if (rowspan > 1) cell.rowSpan = rowspan;
    }
    // Remove from the end so earlier indexes stay valid.
    [...removed].map(id => id.split(",").map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1])
      .forEach(([row, col]) => rows[row].cells[col].remove());
    table.classList.add("ib-table-merged");
  }
  markGaps(table, grid);
  enhanceColumns(table);
  enhanceNumbers(table);
  enhanceGroups(table);
  // A long table scrolls inside its own frame so the header row can stay put (see .ib-table-tall in the styles).
  if (rows.length > 16) table.closest(".el-table")?.classList.add("ib-table-tall");
  for (const cell of table.querySelectorAll("td")) {
    const match = CHECK.exec((cell.textContent || "").trim());
    if (!match || cell.children.length > 1) continue;
    const checked = match[1] !== " ";
    cell.empty();
    cell.createSpan({ cls: `ib-table-check${checked ? " is-checked" : ""}`, text: checked ? "☑" : "☐" })
      .setAttribute("aria-label", checked ? tr("已完成") : tr("未完成"));
  }
}

/** Thousands separators for plain integers of five or more digits (so years stay as they are); decimals are kept. */
export function formatNumberCell(text: string): string | null {
  const match = /^([+-]?)(\d{5,})(\.\d+)?$/.exec(text.trim());
  if (!match) return null;
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${match[3] || ""}`;
}

export function percentValue(text: string): number | null {
  const match = /^(\d{1,3}(?:\.\d+)?)\s*%$/.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}

/** Row levels from leading `>` marks: ["> a", ">> b", "c"] gives [1, 2, 0] and the text without the marks. */
export function rowLevels(firstCells: string[]) {
  return firstCells.map(text => {
    const match = /^\s*(>+)\s*(.*)$/s.exec(text);
    return match ? { level: match[1].length, text: match[2] } : { level: 0, text };
  });
}

/** The formats wrapping a header's whole text, outermost first: <strong><em>Name</em></strong> gives STRONG, EM. */
function headerFormats(th: HTMLElement) {
  const formats: string[] = [];
  let parent: Element = th;
  while (parent.children.length === 1) {
    const child = parent.children[0];
    if (!/^(STRONG|EM|MARK|DEL|S)$/.test(child.tagName) || (parent.textContent || "").trim() !== (child.textContent || "").trim()) break;
    formats.push(child.tagName);
    parent = child;
  }
  return formats;
}

/** The body cells that start in grid column `index`, once merged cells are accounted for. */
function columnCells(table: HTMLTableElement, index: number) {
  const taken: number[][] = [];
  const found: HTMLTableCellElement[] = [];
  [...table.rows].forEach((row, r) => {
    let col = 0;
    for (const cell of row.cells) {
      while (taken[r]?.includes(col)) col++;
      for (let dr = 0; dr < cell.rowSpan; dr++) for (let dc = 0; dc < cell.colSpan; dc++) (taken[r + dr] ||= []).push(col + dc);
      if (col === index && row.parentElement?.tagName === "TBODY") found.push(cell);
      col += cell.colSpan;
    }
  });
  return found;
}

function enhanceColumns(table: HTMLTableElement) {
  const head = table.tHead?.rows[0];
  if (!head) return;
  const headers = [...head.cells];
  // Hidden columns go last, from the right, so the other indexes stay valid.
  const hidden: number[] = [];
  headers.forEach((th, index) => {
    const formats = headerFormats(th);
    if (formats[0] === "DEL" || formats[0] === "S") { hidden.push(index); return; }
    const cls = ([["STRONG", "ib-col-bold"], ["EM", "ib-col-em"], ["MARK", "ib-col-mark"]] as const).filter(([tag]) => formats.includes(tag)).map(([, name]) => name);
    if (cls.length) columnCells(table, index).forEach(cell => cell.classList.add(...cls));
    if (formats.includes("MARK")) columnCells(table, index).forEach(cell => cell.querySelectorAll("mark").forEach(mark => mark.replaceWith(...mark.childNodes)));
    const marker = CHECK_HEADER.exec(th.textContent || "");
    if (!marker) return;
    removeText(th, marker[0]);
    for (const cell of columnCells(table, index)) {
      if (cell.querySelector("table, img") || cell.parentElement?.classList.contains("ib-row-gap")) continue;
      const parsed = checkboxState(cell.textContent || "");
      if (!parsed) continue;
      cell.empty();
      const box = cell.createSpan({ cls: `ib-table-check is-${parsed.state}${parsed.state === "yes" ? " is-checked" : ""}`, text: parsed.state === "yes" ? "☑" : parsed.state === "partial" ? "◩" : "☐" });
      box.setAttribute("aria-label", parsed.state === "yes" ? tr("已完成") : parsed.state === "partial" ? tr("待定") : tr("未完成"));
      if (parsed.rest) cell.appendText(` ${parsed.rest}`);
    }
  });
  const doomed = hidden.flatMap(index => [headers[index], ...columnCells(table, index).filter(cell => cell.colSpan === 1)]);
  doomed.forEach(cell => cell.remove());
}

function removeText(cell: HTMLElement, text: string) {
  const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    const node = next as Text;
    const at = node.data.indexOf(text);
    if (at >= 0) { node.data = node.data.slice(0, at) + node.data.slice(at + text.length); return; }
  }
}

function markGaps(table: HTMLTableElement, grid: string[][]) {
  const { rows, cols } = blankLines(grid);
  if (!rows.length && !cols.length) return;
  table.classList.add("ib-table-gapped");
  const all = [...table.rows];
  rows.forEach(row => all[row]?.classList.add("ib-row-gap"));
  for (const col of cols) all.forEach(row => { if (row.cells.length === grid[0].length) row.cells[col]?.classList.add("ib-col-gap"); });
}

function enhanceNumbers(table: HTMLTableElement) {
  for (const cell of table.querySelectorAll<HTMLTableCellElement>("td")) {
    const align = cell.style.textAlign || cell.getAttribute("align");
    if (align !== "right" || cell.children.length) continue;
    const text = cell.textContent || "";
    const parts = numberParts(text);
    if (parts?.sign) cell.classList.add(`ib-cell-${parts.sign}`);
    if (parts?.currency) {
      cell.empty();
      cell.createSpan({ cls: "ib-cell-currency", text: parts.currency });
      const amount = text.trim().slice(parts.currency.length).trim();
      cell.appendText(formatNumberCell(amount) || amount);
      cell.classList.add("ib-cell-number");
      continue;
    }
    const formatted = formatNumberCell(text);
    if (formatted) { cell.textContent = formatted; cell.classList.add("ib-cell-number"); continue; }
    const percent = percentValue(text);
    if (percent !== null) {
      cell.classList.add("ib-cell-percent");
      cell.style.setProperty("--ib-percent", `${percent}%`);
    }
  }
}

function enhanceGroups(table: HTMLTableElement) {
  const body = table.tBodies[0];
  if (!body) return;
  const rows = [...body.rows];
  const levels = rowLevels(rows.map(row => row.cells[0]?.textContent || ""));
  if (!levels.some(item => item.level > 0)) return;
  rows.forEach((row, index) => {
    const cell = row.cells[0];
    if (!cell) return;
    row.dataset.ibLevel = String(levels[index].level);
    if (levels[index].level > 0 && cell.children.length === 0) cell.textContent = levels[index].text;
    const hasChildren = (levels[index + 1]?.level ?? 0) > levels[index].level;
    if (!hasChildren) return;
    row.classList.add("ib-row-parent");
    const toggle = createEl("button", { cls: "ib-row-toggle", attr: { type: "button", "aria-expanded": "true", "aria-label": tr("展开或折叠子行") } });
    toggle.textContent = "▾";
    cell.prepend(toggle);
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "▾" : "▸";
      // Show every descendant of every open ancestor again; hide the ones under a closed one.
      const closedAt: number[] = [];
      rows.forEach((candidate, position) => {
        const level = levels[position].level;
        while (closedAt.length && closedAt[closedAt.length - 1] >= level) closedAt.pop();
        candidate.classList.toggle("ib-row-hidden", closedAt.length > 0);
        const rowToggle = candidate.querySelector(".ib-row-toggle");
        if (rowToggle && rowToggle.getAttribute("aria-expanded") !== "true") closedAt.push(level);
      });
    });
  });
}

export function installTableExtras(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => {
    if (!enhancementOn(plugin, "tables", element, context.frontmatter)) return;
    element.querySelectorAll("table").forEach(table => { if (!handledByOther("tables", table)) enhanceTable(table); });
  });
}
