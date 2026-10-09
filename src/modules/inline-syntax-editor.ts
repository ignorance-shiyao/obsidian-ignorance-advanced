import { parseInlineSyntax } from "./inline-syntax-source.js";
import { loadLucideIconData, makeChipElement, makeIconElement } from "./inline-syntax.js";

const { editorInfoField } = require("obsidian");
const { Decoration, ViewPlugin, WidgetType } = require("@codemirror/view");

class InlineSyntaxWidget extends WidgetType {
  constructor(plugin, sourcePath, token) {
    super();
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.token = token;
  }

  eq(other) {
    return this.sourcePath === other.sourcePath && this.token.source === other.token.source && this.token.kind === other.token.kind;
  }

  toDOM() {
    if (this.token.kind === "chip") {
      const element = makeChipElement(this.token);
      element.classList.add("ib-inline-editor-widget");
      return element;
    }
    const element = document.createElement("span");
    element.className = "ib-inline-icon-wrap ib-inline-editor-widget";
    element.textContent = this.token.source;
    loadLucideIconData(this.plugin).then(data => {
      const icon = makeIconElement(this.token.icon, data);
      if (icon) element.replaceChildren(icon);
    }).catch(error => console.error("Ignorance Advanced: 编辑器图标读取失败 —", error));
    return element;
  }

  ignoreEvent() { return true; }
}

function buildInlineSyntaxDecorations(view, plugin, cached = {}) {
  const file = view.state.field(editorInfoField, false)?.file;
  if (!file) return { source: null, sourcePath: null, tokens: [], decorations: Decoration.none };
  const sourcePath = file.path;
  const source = view.state.doc.toString();
  const tokens = cached.source === source ? cached.tokens : parseInlineSyntax(source, null);
  const ranges = [];
  for (const token of tokens) {
    const active = view.state.selection.ranges.some(range => range.empty
      ? range.from >= token.start && range.from < token.end
      : range.from < token.end && range.to > token.start);
    if (active || !view.visibleRanges.some(range => range.to >= token.start && range.from <= token.end)) continue;
    ranges.push(Decoration.replace({ widget: new InlineSyntaxWidget(plugin, sourcePath, token) }).range(token.start, token.end));
  }
  return { source, sourcePath, tokens, decorations: ranges.length ? Decoration.set(ranges, true) : Decoration.none };
}

function inlineSyntaxEditorExtension(plugin) {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.value = buildInlineSyntaxDecorations(view, plugin); }
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.value = buildInlineSyntaxDecorations(update.view, plugin, this.value);
      }
    }
  }, { decorations: view => view.value.decorations });
}

export { InlineSyntaxWidget, buildInlineSyntaxDecorations, inlineSyntaxEditorExtension };
