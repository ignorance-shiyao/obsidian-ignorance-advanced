/* The same heading numbers in Live Preview: a small widget in front of each heading's text. The numbers come
   from the document itself, so they stay right while the note is edited. */
import { numberWithOptions, numberingOptions, scanHeadings, unpublishedIndexes } from "./heading-numbers.js";

const { editorInfoField } = require("obsidian");
const { Decoration, ViewPlugin, WidgetType } = require("@codemirror/view");

class NumberWidget extends WidgetType {
  constructor(text) { super(); this.text = text; }
  eq(other) { return other.text === this.text; }
  toDOM() {
    const span = createSpan({ cls: "ib-heading-number ib-heading-number--editor", text: this.text });
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent() { return true; }
}

function wanted(plugin, view) {
  const file = view.state.field(editorInfoField, false)?.file;
  const frontmatter = file && plugin.app.metadataCache.getFileCache(file)?.frontmatter;
  const classes = [frontmatter?.cssclasses, frontmatter?.cssclass].flat().filter(Boolean).map(String);
  if (classes.includes("ib-unnumbered")) return false;
  return plugin.state?.headingNumbers === true || classes.includes("ib-numbered");
}

function build(view, plugin) {
  if (!wanted(plugin, view)) return Decoration.none;
  const doc = view.state.doc;
  const lines: string[] = [];
  for (let number = 1; number <= doc.lines; number += 1) lines.push(doc.line(number).text);
  const all = scanHeadings(lines);
  const hidden = unpublishedIndexes(all);
  const headings = all.filter((_, index) => !hidden.has(index));
  const numbers = numberWithOptions(headings, numberingOptions(plugin));
  const ranges = [];
  for (const heading of headings) {
    const text = numbers.get(heading.line);
    if (!text) continue;
    const line = doc.line(heading.line + 1);
    ranges.push(Decoration.widget({ widget: new NumberWidget(text), side: -1 }).range(line.from + heading.offset));
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

export function headingNumbersEditorExtension(plugin) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = build(view, plugin); }
    update(update) { if (update.docChanged || update.viewportChanged || update.transactions.some(tr => tr.reconfigured)) this.decorations = build(update.view, plugin); }
  }, { decorations: value => value.decorations });
}
