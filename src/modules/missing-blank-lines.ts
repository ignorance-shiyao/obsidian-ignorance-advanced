import { missingBlankLines, wantsLenient, withBlankLines } from "./missing-blank-lines-core.js";

const { MarkdownRenderChild, MarkdownRenderer, Notice } = require("obsidian");
const { EditorView, ViewPlugin } = require("@codemirror/view");

/* Reading view: a section whose lines hold a table typed straight under a paragraph is rendered again from the
   text with the blank line added, so the table shows as a table. The file itself is not touched. */
export function installLenientBlocks(plugin) {
  plugin.registerMarkdownPostProcessor(async (element, context) => {
    if (!wantsLenient(plugin)) return;
    const info = context.getSectionInfo?.(element);
    if (!info) return;
    const lines = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1);
    if (!missingBlankLines(lines).length || element.querySelector("table")) return;
    const holder = createDiv();
    const child = new MarkdownRenderChild(element);
    context.addChild(child);
    await MarkdownRenderer.render(plugin.app, withBlankLines(lines.join("\n")), holder, context.sourcePath, child);
    element.replaceChildren(...Array.from(holder.childNodes));
    if (element.querySelector(":scope > table")) element.classList.add("el-table");
  });
}

function fixDocument(view): number {
  const lines: string[] = [];
  for (let n = 1; n <= view.state.doc.lines; n += 1) lines.push(view.state.doc.line(n).text);
  const at = missingBlankLines(lines);
  if (!at.length) return 0;
  view.dispatch({
    changes: at.map(index => ({ from: view.state.doc.line(index + 1).from, insert: "\n" })),
    userEvent: "input.ibp-blank-line"
  });
  return at.length;
}

/* Editing: once typing pauses, a table that sits right under a paragraph gets its blank line. Existing notes are
   left alone until the command below is run, so opening a note never changes it. */
export function lenientBlocksEditorExtension(plugin) {
  return ViewPlugin.fromClass(class {
    timer = 0;
    update(update) {
      if (!update.docChanged || !wantsLenient(plugin)) return;
      if (!update.transactions.some(tr => tr.isUserEvent("input") || tr.isUserEvent("delete")) || update.transactions.some(tr => tr.isUserEvent("input.ibp-blank-line"))) return;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const view = update.view;
        if (!view.dom.isConnected) return;
        // Only the lines around the cursor are looked at, so a note with an old mistake is not rewritten by typing elsewhere.
        const doc = view.state.doc;
        const head = doc.lineAt(view.state.selection.main.head).number - 1;
        const lines: string[] = [];
        for (let n = 1; n <= doc.lines; n += 1) lines.push(doc.line(n).text);
        const at = missingBlankLines(lines, Math.max(0, head - 3), head + 4);
        if (at.length) view.dispatch({ changes: at.map(index => ({ from: doc.line(index + 1).from, insert: "\n" })), userEvent: "input.ibp-blank-line" });
      }, 700);
    }
    destroy() { window.clearTimeout(this.timer); }
  });
}

export function addLenientCommand(plugin) {
  plugin.addCommand({
    id: "fix-missing-blank-lines",
    name: "补全缺失的空行（让表格被识别）",
    editorCallback: editor => {
      const view = editor.cm;
      const count = view ? fixDocument(view) : 0;
      new Notice(count ? `已在 ${count} 个表格前补上空行（可撤销）` : "没有发现缺少空行的表格");
    }
  });
}

export { missingBlankLines, wantsLenient, withBlankLines };
