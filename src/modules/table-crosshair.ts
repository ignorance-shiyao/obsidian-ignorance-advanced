import { enhancementOn } from "./enhancement-gate.js";
import type { IgnorancePlugin } from "../plugin-types.js";
/* Table reading aid: pointing at a cell lights up its whole row and column. Reading view only; on with the
   setting "table crosshair" or per note with the `ib-crosshair` cssclass. */
const ROW = "ib-xh-row", COLUMN = "ib-xh-col";

export function installTableCrosshair(plugin: IgnorancePlugin) {
  let current: HTMLTableElement | null = null;
  const clear = () => {
    current?.querySelectorAll(`.${ROW}, .${COLUMN}`).forEach(element => element.classList.remove(ROW, COLUMN));
    current = null;
  };
  const enabled = (table: Element) => enhancementOn(plugin, "tables", table) && (plugin.state?.tableCrosshair === true || Boolean(table.closest(".ib-crosshair")));
  plugin.registerDomEvent(document, "mouseover", (event: MouseEvent) => {
    const cell = event.target instanceof Element ? event.target.closest<HTMLTableCellElement>("td, th") : null;
    const table = cell?.closest("table");
    if (!cell || !table || !table.closest(".markdown-preview-view") || !enabled(table)) { if (current) clear(); return; }
    clear();
    current = table;
    const column = cell.cellIndex;
    cell.parentElement?.classList.add(ROW);
    for (const row of Array.from(table.rows)) row.cells[column]?.classList.add(COLUMN);
  });
  plugin.registerDomEvent(document, "mouseleave", clear);
  plugin.register(clear);
}
