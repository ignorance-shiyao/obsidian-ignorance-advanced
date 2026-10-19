import { enhancementOn, handledByOther } from "./enhancement-gate.js";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
/* Table extras in Reading view and exports (plain Markdown tables, nothing changes in the file):
     - a cell holding only `<` joins the cell on its left, one holding only `^` joins the cell above
     - a cell holding only `[ ]` / `[x]` shows an empty or ticked box
     - in a right-aligned column (`---:`) long integers get thousands separators and `72%` draws a bar
     - a first cell starting with `>` makes the row a child of the row above; parents fold and unfold their children */
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
    if (mark === "<" && col > 0) target = owner[row][col - 1];
    else if (mark === "^" && row > 0 && col < grid[row - 1].length) target = owner[row - 1][col];
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

function enhanceNumbers(table: HTMLTableElement) {
  for (const cell of table.querySelectorAll<HTMLTableCellElement>("td")) {
    const align = cell.style.textAlign || cell.getAttribute("align");
    if (align !== "right" || cell.children.length) continue;
    const text = cell.textContent || "";
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
