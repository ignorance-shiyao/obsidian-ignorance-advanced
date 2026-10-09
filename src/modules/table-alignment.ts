import MarkdownIt from "markdown-it";
import { setIcon, UI_ICONS } from "./ui-icons.js";
import { saveErrorMessage, holdScrollPosition, replaceRangeQuietly } from "./quiet-edit.js";
const { Menu, Notice, MarkdownView } = require("obsidian");
const marker = /^\s*<!--\s*ib-table-align:(left|center|right)\s*-->\s*$/;
function tables(source) { return new MarkdownIt().parse(source, {}).filter(t => t.type === "table_open"); }
function metadata(lines, start) {
  let line = start - 1;
  while (line >= 0 && !lines[line].trim()) line--;
  const match = marker.exec(lines[line] || "");
  return { line: match ? line : null, alignment: match?.[1] || null };
}
export function applyTableSourceAlignment(root, source) {
  const entries = tables(source), lines = source.split("\n");
  [...root.querySelectorAll("table")].forEach((table: HTMLElement, index) => {
    if (table.closest(".markdown-embed, .internal-embed")) return;
    const value = entries[index] ? metadata(lines, entries[index].map[0]).alignment : null;
    if (value) table.dataset.ibTableAlign = value;
    else delete table.dataset.ibTableAlign;
  });
}
// Obsidian reuses an already rendered table section when only the marker comment above it changed
// (set from Live Preview), so a table in reading view kept its old position. Re-read the markers
// from the source whenever a reading view could be showing stale ones.
export async function syncPreviewTableAlignment(plugin, view) {
  const file = view?.file, preview = view?.containerEl?.querySelector(".markdown-preview-view");
  if (!file || !preview || view.getMode?.() !== "preview") return;
  const source = await plugin.app.vault.cachedRead(file);
  applyTableSourceAlignment(preview, source);
}
export function tableAlignmentControl(plugin, table, path, ordinal) {
  const locate = async () => {
    if (!path || ordinal == null || ordinal < 0) throw Error("未找到表格源码位置");
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
    const editor = view?.file?.path === path && view.getMode() === "source" ? view.editor : null;
    const file = plugin.app.vault.getAbstractFileByPath(path);
    const source = editor ? editor.getValue() : await plugin.app.vault.cachedRead(file);
    const entry = tables(source)[ordinal];
    if (!entry) throw Error("表格已发生变化，请重新打开位置菜单");
    const lines = source.split("\n"), start = entry.map[0];
    return { editor, file, source, lines, start, ...metadata(lines, start) };
  };
  void locate().then(found => { if (found.alignment) table.dataset.ibTableAlign = found.alignment; }).catch(() => {});
  return host => {
    const button = host.createEl("button", {cls:"ibt-align",attr:{type:"button",title:"表格位置","aria-label":"表格位置"}});
    setIcon(button, UI_ICONS.alignCenter);
    button.addEventListener("pointerdown", e => {e.preventDefault();e.stopPropagation();});
    button.addEventListener("click", event => {
      event.preventDefault();event.stopPropagation();
      const menu = new Menu();
      for (const [id,label] of [["default","跟随默认"],["left","居左"],["center","居中"],["right","居右"]]) menu.addItem(item => item.setTitle(label).setChecked((table.dataset.ibTableAlign || "default") === id).onClick(async () => {
        const previous = table.dataset.ibTableAlign || "default";
        // Position is pure CSS: show it at once, then persist the marker. Saving re-renders the
        // note, so the reading position is held until that settles.
        const release = holdScrollPosition(table);
        if (id === "default") delete table.dataset.ibTableAlign; else table.dataset.ibTableAlign = id;
        try {
          const found = await locate();
          if (found.line !== null) {
            if (id === "default") found.lines.splice(found.line,1);
            else found.lines[found.line] = `<!-- ib-table-align:${id} -->`;
          } else if (id !== "default") found.lines.splice(found.start,0,`<!-- ib-table-align:${id} -->`,"");
          const text = found.lines.join("\n");
          if (text === found.source) return;
          if (found.editor) {
            // One editor transaction preserves undo and other unsaved content.
            const old = found.source.split("\n");
            let a=0;while(a<old.length&&a<found.lines.length&&old[a]===found.lines[a])a++;
            let b=old.length,c=found.lines.length;while(b>a&&c>a&&old[b-1]===found.lines[c-1]){b--;c--;}
            replaceRangeQuietly(found.editor,{line:a,ch:0},b<old.length?{line:b,ch:0}:{line:old.length-1,ch:old.at(-1).length},found.lines.slice(a,c).join("\n")+(b<old.length?"\n":""));
          } else await plugin.app.vault.process(found.file, () => text);
        } catch(error) {
          release();
          if (previous === "default") delete table.dataset.ibTableAlign; else table.dataset.ibTableAlign = previous;
          new Notice(`表格位置未保存：${saveErrorMessage(error)}`);
        }
      }));
      const box=button.getBoundingClientRect();menu.showAtPosition({x:box.left,y:box.bottom+4});
    });
  };
}
