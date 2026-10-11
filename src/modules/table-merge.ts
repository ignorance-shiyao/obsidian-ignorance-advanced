/* Table extras in Reading view and exports (plain Markdown tables, nothing changes in the file):
     - a cell holding only `<` joins the cell on its left, one holding only `^` joins the cell above
     - a cell holding only `[ ]` / `[x]` shows an empty or ticked box */
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
  for (const cell of table.querySelectorAll("td")) {
    const match = CHECK.exec((cell.textContent || "").trim());
    if (!match || cell.children.length > 1) continue;
    const checked = match[1] !== " ";
    cell.empty();
    cell.createSpan({ cls: `ib-table-check${checked ? " is-checked" : ""}`, text: checked ? "☑" : "☐" })
      .setAttribute("aria-label", checked ? "已完成" : "未完成");
  }
}

export function installTableExtras(plugin) {
  plugin.registerMarkdownPostProcessor(element => {
    element.querySelectorAll("table").forEach(table => enhanceTable(table as HTMLTableElement));
  });
}
