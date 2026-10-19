import type { Editor } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { insideFence, linkPasteMarkdown, tablePasteMarkdown } from "./paste-enhance-core.js";

/** Turns two kinds of paste into Markdown: a URL over selected text, and spreadsheet cells. */
export function handleEnhancedPaste(plugin: IgnorancePlugin, event: ClipboardEvent, editor: Editor) {
  if (event.defaultPrevented || event.clipboardData?.files.length) return;
  const clipboard = event.clipboardData?.getData("text/plain") ?? "";
  if (!clipboard) return;
  const selected = editor.getSelection();
  const offset = editor.posToOffset(editor.getCursor("from"));
  if (insideFence(editor.getValue(), offset)) return;
  const insert = selected
    ? plugin.state.pasteLink !== false ? linkPasteMarkdown(selected, clipboard) : null
    : plugin.state.pasteTable !== false ? tablePasteMarkdown(clipboard) : null;
  if (insert === null) return;
  event.preventDefault();
  editor.replaceSelection(insert);
}
