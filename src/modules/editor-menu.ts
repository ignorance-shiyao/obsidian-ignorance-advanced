import type { Editor, Menu } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { Notice } from "obsidian";
import { parseCaptions } from "./captions.js";
import { SELECTION_FORMATS, applyFormat, referenceItems, type SelectionFormat } from "./selection-formats.js";
/* The "Ignorance" entry in the editor's right-click menu: formats for the selected text. Each one is also a
   command, so it can be given a shortcut. One replacement per format, so one undo puts the text back. */

function applyToEditor(editor: Editor, format: SelectionFormat) {
  const from = editor.getCursor("from"), to = editor.getCursor("to");
  const start = format.block ? { line: from.line, ch: 0 } : from;
  const end = format.block ? { line: to.line, ch: editor.getLine(to.line).length } : to;
  const original = editor.getRange(start, end);
  if (!original.trim()) return false;
  const result = applyFormat(format, original);
  editor.replaceRange(result.text, start, end);
  const base = editor.posToOffset(start);
  if (result.selectTo > result.selectFrom) editor.setSelection(editor.offsetToPos(base + result.selectFrom), editor.offsetToPos(base + result.selectTo));
  return true;
}

function insertReference(editor: Editor, text: string) {
  editor.replaceSelection(text);
}

export function installEditorMenu(plugin: IgnorancePlugin) {
  for (const format of SELECTION_FORMATS) {
    plugin.addCommand({
      id: `format-${format.id}`,
      name: `格式：${format.name}`,
      editorCheckCallback: (checking, editor) => {
        if (!editor.somethingSelected() && !format.block) return false;
        return checking || applyToEditor(editor, format);
      }
    });
  }
  plugin.registerEvent(plugin.app.workspace.on("editor-menu", (menu: Menu, editor: Editor) => {
    if (!editor.somethingSelected()) return;
    menu.addItem(item => {
      item.setTitle("Ignorance").setIcon("sparkles");
      const submenu = item.setSubmenu();
      const groups = [...new Set(SELECTION_FORMATS.map(format => format.group))];
      for (const group of groups) {
        submenu.addItem(entry => {
          entry.setTitle(group);
          const inner = entry.setSubmenu();
          for (const format of SELECTION_FORMATS.filter(candidate => candidate.group === group)) {
            inner.addItem(option => option.setTitle(format.name).onClick(() => { if (!applyToEditor(editor, format)) new Notice("请先选中要处理的文字"); }));
          }
        });
      }
      submenu.addItem(entry => {
        entry.setTitle("交叉引用");
        const ids = parseCaptions(editor.getValue()).map(caption => caption.id).filter((id): id is string => Boolean(id));
        const inner = entry.setSubmenu();
        if (!ids.length) inner.addItem(option => option.setTitle("本篇没有带 {#标识} 的题注").setDisabled(true));
        for (const reference of referenceItems([...new Set(ids)])) inner.addItem(option => option.setTitle(reference.text).onClick(() => insertReference(editor, reference.text)));
      });
    });
  }));
}
