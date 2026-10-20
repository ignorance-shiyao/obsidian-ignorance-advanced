import { enhancementOn, handledByOther } from "./enhancement-gate.js";
import { tr } from "../i18n.js";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Notice, TFile, setIcon } from "obsidian";
import { saveExportToVault } from "./export.js";
import { reorderTableLines, revertTableLines, rowsToCsv, rowsToTsv, sortedOrder, type SortDirection } from "./table-sort-core.js";
/* Reading-view table aids: click a heading to sort (ascending, descending, original), a search box, copy as TSV,
   save as CSV. Sorting only reorders what is shown; "write back" rewrites the Markdown table in the file, and the
   notice it shows can put that table's old rows back, leaving the rest of the note alone. Nothing is added to the page until the pointer first reaches a table,
   so exports stay clean. Tables with merged cells or row groups are left alone. */
interface SortState { rows: HTMLTableRowElement[]; column: number; direction: SortDirection | null }

const states = new WeakMap<HTMLTableElement, SortState>();

const cellText = (cell: Element | undefined) => (cell?.textContent || "").replace(/\s+/g, " ").trim();
const sortable = (table: HTMLTableElement) => Boolean(table.tHead?.rows.length === 1 && table.tBodies[0]?.rows.length > 1)
  && !table.classList.contains("ib-table-merged") && !table.querySelector("[data-ib-level]");
const usable = (plugin: IgnorancePlugin, table: HTMLTableElement) => sortable(table) && enhancementOn(plugin, "tables", table) && !handledByOther("tables", table);
const inReading = (table: Element | null): table is HTMLTableElement => Boolean(table?.instanceOf(HTMLTableElement) && table.closest(".markdown-preview-view"));

function stateOf(table: HTMLTableElement): SortState {
  let state = states.get(table);
  if (!state) {
    state = { rows: [...table.tBodies[0].rows], column: -1, direction: null };
    state.rows.forEach((row, index) => { row.dataset.ibRow = String(index); });
    states.set(table, state);
  }
  return state;
}

function apply(table: HTMLTableElement, state: SortState) {
  const body = table.tBodies[0];
  const order = state.direction ? sortedOrder(state.rows.map(row => cellText(row.cells[state.column])), state.direction) : state.rows.map((_, index) => index);
  body.append(...order.map(index => state.rows[index]));
  [...table.tHead.rows[0].cells].forEach((cell, index) => {
    if (index === state.column && state.direction) cell.dataset.ibSort = state.direction; else delete cell.dataset.ibSort;
    cell.setAttribute("aria-sort", index === state.column && state.direction ? (state.direction === "asc" ? "ascending" : "descending") : "none");
  });
  table.classList.toggle("ib-table-sorted", state.direction !== null);
  table.closest(".el-table")?.previousElementSibling?.querySelector<HTMLElement>("[data-act=writeback]")?.toggleAttribute("hidden", state.direction === null);
}

function visibleRows(table: HTMLTableElement) {
  return [...table.rows].filter(row => !row.hidden && !row.classList.contains("ib-row-filtered"));
}

function tableText(table: HTMLTableElement) {
  return visibleRows(table).map(row => [...row.cells].map(cell => cellText(cell)));
}

async function writeBack(plugin: IgnorancePlugin, table: HTMLTableElement) {
  const path = table.dataset.ibPath, range = table.dataset.ibLines?.split("-").map(Number);
  const file = path ? plugin.app.vault.getAbstractFileByPath(path) : null;
  const state = states.get(table);
  if (!(file instanceof TFile) || !range || range.length !== 2 || !state?.direction) { new Notice(tr("没法确定这张表在笔记里的位置，未写回。")); return; }
  const order = [...table.tBodies[0].rows].map(row => Number(row.dataset.ibRow));
  let before: string[] = [], written: string[] = [];
  await plugin.app.vault.process(file, text => {
    const lines = text.split("\n");
    const next = reorderTableLines(lines.slice(range[0], range[1] + 1).map(line => line.replace(/\r$/, "")), order);
    if (!next) return text;
    before = lines.slice(range[0], range[1] + 1).map(line => line.replace(/\r$/, ""));
    written = next;
    return [...lines.slice(0, range[0]), ...next, ...lines.slice(range[1] + 1)].join("\n");
  });
  if (!written.length) { new Notice(tr("这张表的源码不是普通的竖线表格，未写回。")); return; }
  const notice = new Notice("", 10000);
  notice.messageEl.createSpan({ text: tr("已按当前顺序写回笔记。") });
  notice.messageEl.createEl("button", { text: tr("撤销"), cls: "ibp-table-undo" }).addEventListener("click", () => {
    notice.hide();
    let undone = false;
    void plugin.app.vault.process(file, text => {
      const next = revertTableLines(text, written, before, range[0]);
      undone = next !== null;
      return next ?? text;
    }).then(() => { if (!undone) new Notice(tr("这张表写回后又被改过，未撤销，以免覆盖新内容。")); });
  });
}

function buildTools(plugin: IgnorancePlugin, table: HTMLTableElement, host: HTMLElement) {
  // A zero-height anchor above the table, so the bar adds no height and the table's own scroll frame is untouched.
  const anchor = createDiv({ cls: "ibp-table-anchor" });
  anchor.setCssProps({ width: `${table.offsetWidth}px` });
  host.before(anchor);
  // The bar shows while the pointer is over the table (a class instead of a :has() selector, which is slow to invalidate).
  host.addEventListener("pointerenter", () => anchor.addClass("is-table-hover"));
  host.addEventListener("pointerleave", () => anchor.removeClass("is-table-hover"));
  const bar = anchor.createDiv({ cls: "ibp-table-tools" });
  const button = (act: string, icon: string, label: string, hidden = false) => {
    const element = bar.createEl("button", { cls: "ibp-table-tool", attr: { "data-act": act, "aria-label": label, type: "button" } });
    setIcon(element, icon);
    element.toggleAttribute("hidden", hidden);
    return element;
  };
  const search = bar.createEl("input", { cls: "ibp-table-search", attr: { type: "search", placeholder: tr("筛选行"), "aria-label": tr("筛选表格行") } });
  search.hidden = true;
  button("search", "search", tr("筛选行")).addEventListener("click", () => { search.hidden = !search.hidden; if (!search.hidden) search.focus(); });
  search.addEventListener("input", () => {
    const query = search.value.trim().toLowerCase();
    for (const row of table.tBodies[0].rows) row.classList.toggle("ib-row-filtered", Boolean(query) && !cellText(row).toLowerCase().includes(query));
  });
  button("copy", "copy", tr("复制为 TSV")).addEventListener("click", () => {
    void navigator.clipboard.writeText(rowsToTsv(tableText(table))).then(() => new Notice(tr("已复制表格，可直接粘贴到电子表格")));
  });
  button("csv", "file-down", tr("保存为 CSV")).addEventListener("click", () => {
    void saveExportToVault(plugin, `${table.closest(".markdown-preview-view")?.querySelector(".inline-title")?.textContent || "表格"}.csv`, rowsToCsv(tableText(table)))
      .then(path => new Notice(tr("已保存：{path}", { path })));
  });
  button("writeback", "arrow-down-up", tr("按此顺序写回笔记"), true).addEventListener("click", () => { void writeBack(plugin, table); });
}

export function installTableSort(plugin: IgnorancePlugin) {
  // Where each table sits in the source, so "write back" can find it.
  plugin.registerMarkdownPostProcessor((element, context) => {
    const tables = element.querySelectorAll("table");
    const info = context.getSectionInfo(element);
    if (tables.length !== 1 || !info) return;
    tables[0].dataset.ibLines = `${info.lineStart}-${info.lineEnd}`;
    tables[0].dataset.ibPath = context.sourcePath;
    // Headings take keyboard focus so a table can be sorted without a mouse (Enter or Space, below).
    if (sortable(tables[0])) for (const cell of tables[0].tHead.rows[0].cells) cell.tabIndex = 0;
  });
  const reveal = (event: Event) => {
    const table = event.target instanceof Element ? event.target.closest("table") : null;
    if (!inReading(table) || !usable(plugin, table)) return;
    const host = table.closest<HTMLElement>(".el-table") ?? table.parentElement;
    if (host && !host.previousElementSibling?.classList.contains("ibp-table-anchor")) buildTools(plugin, table, host);
  };
  plugin.registerDomEvent(document, "pointerover", reveal);
  plugin.registerDomEvent(document, "pointerdown", reveal);
  plugin.registerDomEvent(document, "focusin", reveal);
  const sortBy = (heading: HTMLTableCellElement | null) => {
    const table = heading?.closest("table") ?? null;
    if (!heading || !inReading(table) || !usable(plugin, table) || heading.parentElement?.parentElement !== table.tHead) return false;
    const state = stateOf(table);
    const column = heading.cellIndex;
    state.direction = state.column !== column || state.direction === null ? "asc" : state.direction === "asc" ? "desc" : null;
    state.column = column;
    apply(table, state);
    return true;
  };
  plugin.registerDomEvent(document, "click", (event: MouseEvent) => {
    if (!(event.target instanceof Element) || event.target.closest("a, button") || window.getSelection()?.toString()) return;
    sortBy(event.target.closest<HTMLTableCellElement>("th"));
  });
  plugin.registerDomEvent(document, "keydown", (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target instanceof HTMLTableCellElement && event.target.matches("th") ? event.target : null;
    if (sortBy(target)) event.preventDefault();
  });
}
