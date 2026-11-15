import { setIcon } from "obsidian";
import { tr } from "../i18n.js";
/* Long code blocks, quotes and tables in Reading view start folded, with a button to show everything.
   Off by default (setting "fold long content"). Paged reading and exports always show the whole block. */
export const FOLD_ABOVE = 40;
export const QUOTE_FOLD_ABOVE = 600;
export const QUOTE_FOLD_BLOCKS = 8;
export const TABLE_FOLD_ABOVE = 15;

export function codeLineCount(text: string): number {
  return String(text || "").replace(/\n$/, "").split("\n").length;
}

/** Characters of visible text in a quote, ignoring whitespace. */
export function quoteTextLength(text: string): number {
  return String(text || "").replace(/\s+/g, "").length;
}

/** Whether a Reading-view quote is long enough to start folded (it then shows about 14em with a fade). */
export function shouldFoldQuote(quote: HTMLElement): boolean {
  // Long by text (CJK-dense quotes) or by blocks (many short lines/items read just as tall).
  if (quoteTextLength(quote.textContent || "") > QUOTE_FOLD_ABOVE) return true;
  return quote.querySelectorAll(":scope > p, :scope > ul > li, :scope > ol > li").length > QUOTE_FOLD_BLOCKS;
}

/** Called when a fold button is pressed; returning true means the caller handles it (paged view re-paginates). */
export type FoldExpand = (index: number) => boolean;

/* Folds long code, quotes and tables under `root`. Each fold gets an index in document order, so a paged copy
   can remember which ones the reader opened. `expanded` lists indexes to leave open. */
export function applyFolds(root: HTMLElement, { expanded = new Set<number>(), onExpand }: { expanded?: Set<number>; onExpand?: FoldExpand } = {}) {
  let index = 0;
  // Icon-only toggle: a chevron that turns over when open; the label is for screen readers only.
  const fold = (target: HTMLElement, foldedClass: string[], buttonClass: string, expand: string) => {
    const at = index++;
    const button = createEl("button", { cls: ["ib-fold-toggle", buttonClass], attr: { type: "button", "data-ib-fold-index": String(at) } });
    setIcon(button, "chevron-down");
    const sync = (open: boolean) => {
      button.toggleClass("is-open", open);
      button.setAttribute("aria-label", open ? tr("收起") : expand);
      button.setAttribute("aria-expanded", String(open));
    };
    const open = expanded.has(at);
    if (!open) target.classList.add(...foldedClass);
    sync(open);
    button.addEventListener("click", () => {
      if (onExpand?.(at)) return;
      sync(!target.classList.toggle(foldedClass[foldedClass.length - 1]));
    });
    target.after(button);
  };
  for (const pre of root.querySelectorAll<HTMLElement>("pre")) {
    if (pre.classList.contains("ib-code-folded") || pre.closest(".ibc-container-editor-widget, .slide-surface")) continue;
    const lines = codeLineCount(pre.textContent || "");
    if (lines > FOLD_ABOVE) fold(pre, ["ib-code-folded"], "ib-code-expand", tr("展开全部 {lines} 行", { lines }));
  }
  for (const quote of root.querySelectorAll<HTMLElement>("blockquote")) {
    if (quote.parentElement?.closest("blockquote") || quote.classList.contains("ib-fold") || !shouldFoldQuote(quote)) continue;
    quote.classList.add("ib-fold");
    fold(quote, ["ib-fold", "is-folded"], "ib-fold-quote", tr("展开全文"));
  }
  for (const table of root.querySelectorAll<HTMLElement>("table")) {
    if (table.classList.contains("ib-fold") || table.closest(".slide-surface, .cm-table-widget")) continue;
    const rows = table.querySelectorAll("tbody > tr").length;
    if (rows <= TABLE_FOLD_ABOVE) continue;
    table.classList.add("ib-fold");
    fold(table, ["ib-fold", "is-folded"], "ib-fold-table", tr("展开全部 {rows} 行", { rows }));
  }
}

/* Tall tables get a scrolling frame from the theme so the header stays in view; CSS alone cannot count rows. */
export function markTallTables(root: HTMLElement) {
  for (const table of root.querySelectorAll<HTMLElement>("table")) {
    if (table.querySelectorAll("tbody > tr").length > TABLE_FOLD_ABOVE) table.closest(".el-table")?.addClass("ib-table-tall");
  }
}
