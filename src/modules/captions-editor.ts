import type { IgnorancePlugin } from "../plugin-types.js";
import { editorInfoField } from "obsidian";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { StateField } from "@codemirror/state";
/* Captions in Live Preview: the numbered label ("图 1", "表 2") appears in the editor too. A figure gets its caption
   as a block under the image; table, code and equation caption lines show their label in place of the "表：" prefix. */
import { parseCaptions, wantsCaptions, type CaptionEntry } from "./captions.js";


class LabelWidget extends WidgetType {
  constructor(label: string, block, text = "") { super(); this.label = label; this.block = block; this.text = text; }
  eq(other) { return other.label === this.label && other.text === this.text && other.block === this.block; }
  toDOM() {
    const wrap = this.block ? createDiv({ cls: "ib-caption ib-caption--editor" }) : createSpan({ cls: "ib-caption__label ib-caption__label--editor" });
    if (this.block) { wrap.append(createSpan({ cls: "ib-caption__label", text: this.label }), ` ${this.text}`); } else wrap.textContent = this.label;
    return wrap;
  }
  ignoreEvent() { return true; }
}

const PREFIX = /^\s*(?:表|Table|代码|Listing|公式|式|Equation)\s*[:：]\s*/i;
const ID_SUFFIX = /\s*\{#[\w-]+\}\s*$/;

function build(state, plugin: IgnorancePlugin) {
  const file = state.field(editorInfoField, false)?.file;
  const frontmatter = file && plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  if (!wantsCaptions(plugin, frontmatter)) return Decoration.none;
  const doc = state.doc;
  const entries: CaptionEntry[] = parseCaptions(doc.toString());
  const ranges = [];
  for (const entry of entries) {
    const line = doc.line(entry.line + 1);
    if (entry.kind === "fig") {
      ranges.push(Decoration.widget({ widget: new LabelWidget(entry.label, true, entry.text), block: true, side: 1 }).range(line.to));
      continue;
    }
    const prefix = PREFIX.exec(line.text);
    if (!prefix) continue;
    ranges.push(Decoration.replace({ widget: new LabelWidget(entry.label, false) }).range(line.from, line.from + prefix[0].length));
    const suffix = ID_SUFFIX.exec(line.text);
    if (suffix && suffix.index > prefix[0].length) ranges.push(Decoration.replace({}).range(line.from + suffix.index, line.to));
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

export function captionsEditorExtension(plugin: IgnorancePlugin) {
  return StateField.define({
    create: state => build(state, plugin),
    update: (value, transaction) => (transaction.docChanged || transaction.reconfigured ? build(transaction.state, plugin) : value),
    provide: field => EditorView.decorations.from(field)
  });
}
