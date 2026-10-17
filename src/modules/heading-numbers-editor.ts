import type { IgnorancePlugin } from "../plugin-types.js";
import { editorInfoField } from "obsidian";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
/* The same heading numbers in Live Preview: a small widget in front of each heading's text. The numbers come
   from the document itself, so they stay right while the note is edited. */
import { numberWithOptions, numberingOptions, scanHeadings, unpublishedIndexes } from "./heading-numbers.js";


class NumberWidget extends WidgetType {
  readonly text: string;
  constructor(text: string) { super(); this.text = text; }
  eq(other: NumberWidget) { return other.text === this.text; }
  toDOM() {
    const span = createSpan({ cls: "ib-heading-number ib-heading-number--editor", text: this.text });
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent() { return true; }
}

function wanted(plugin: IgnorancePlugin, view: EditorView) {
  const file = view.state.field(editorInfoField, false)?.file;
  const frontmatter = file && plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-unnumbered")) return false;
  return plugin.state?.headingNumbers === true || classes.includes("ib-numbered");
}

function build(view: EditorView, plugin: IgnorancePlugin) {
  if (!wanted(plugin, view)) return Decoration.none;
  const doc = view.state.doc;
  const lines: string[] = [];
  for (let number = 1; number <= doc.lines; number += 1) lines.push(doc.line(number).text);
  const all = scanHeadings(lines);
  const hidden = unpublishedIndexes(all);
  const headings = all.filter((_, index) => !hidden.has(index));
  const numbers = numberWithOptions(headings, numberingOptions(plugin));
  const ranges: Range<Decoration>[] = [];
  for (const heading of headings) {
    const text = numbers.get(heading.line);
    if (!text) continue;
    const line = doc.line(heading.line + 1);
    ranges.push(Decoration.widget({ widget: new NumberWidget(text), side: -1 }).range(line.from + heading.offset));
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

export function headingNumbersEditorExtension(plugin: IgnorancePlugin) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view, plugin); }
    update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.reconfigured)) this.decorations = build(update.view, plugin); }
  }, { decorations: value => value.decorations });
}
