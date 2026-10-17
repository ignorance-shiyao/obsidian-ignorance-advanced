import type { IgnorancePlugin } from "../plugin-types.js";
import { editorInfoField } from "obsidian";
import { Decoration, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { parseInlineSyntax, type InlineSyntaxToken } from "./inline-syntax-source.js";
import { loadLucideIconData, makeChipElement, makeIconElement } from "./inline-syntax.js";
import { parseCaptions, wantsCaptions } from "./captions.js";


interface InlineSyntaxDecorations {
  source: string | null;
  sourcePath: string | null;
  tokens: InlineSyntaxToken[];
  decorations: DecorationSet;
}

class InlineSyntaxWidget extends WidgetType {
  plugin: IgnorancePlugin;
  sourcePath: string;
  token: InlineSyntaxToken;

  constructor(plugin: IgnorancePlugin, sourcePath: string, token: InlineSyntaxToken) {
    super();
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.token = token;
  }

  eq(other: InlineSyntaxWidget) {
    return this.sourcePath === other.sourcePath && this.token.source === other.token.source && this.token.kind === other.token.kind;
  }

  toDOM() {
    if (this.token.kind === "chip") {
      const element = makeChipElement(this.token);
      element.classList.add("ib-inline-editor-widget");
      return element;
    }
    const element = createSpan();
    element.className = "ib-inline-icon-wrap ib-inline-editor-widget";
    element.textContent = this.token.source;
    loadLucideIconData(this.plugin).then(data => {
      const icon = makeIconElement(this.token.icon ?? "", data);
      if (icon) element.replaceChildren(icon);
    }).catch(error => console.error("Ignorance Advanced: 编辑器图标读取失败 —", error));
    return element;
  }

  ignoreEvent() { return true; }
}

function buildInlineSyntaxDecorations(view: EditorView, plugin: IgnorancePlugin, cached: Partial<InlineSyntaxDecorations> = {}): InlineSyntaxDecorations {
  const file = view.state.field(editorInfoField, false)?.file;
  if (!file) return { source: null, sourcePath: null, tokens: [], decorations: Decoration.none };
  const sourcePath = file.path;
  const source = view.state.doc.toString();
  const tokens = cached.source === source ? cached.tokens : parseInlineSyntax(source, null);
  if (cached.source !== source && tokens.some(token => token.type === "ref")) {
    // Cross references show the figure / table label in the editor as well.
    const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (wantsCaptions(plugin, frontmatter)) {
      const labels = new Map(parseCaptions(source).filter(entry => entry.id).map((entry): [string, string] => [entry.id ?? "", entry.label]));
      for (const token of tokens) if (token.type === "ref") token.label = labels.get(token.value) || `?${token.value}`;
    }
  }
  const ranges: Range<Decoration>[] = [];
  for (const token of tokens) {
    const active = view.state.selection.ranges.some(range => range.empty
      ? range.from >= token.start && range.from < token.end
      : range.from < token.end && range.to > token.start);
    if (active || !view.visibleRanges.some(range => range.to >= token.start && range.from <= token.end)) continue;
    ranges.push(Decoration.replace({ widget: new InlineSyntaxWidget(plugin, sourcePath, token) }).range(token.start, token.end));
  }
  return { source, sourcePath, tokens, decorations: ranges.length ? Decoration.set(ranges, true) : Decoration.none };
}

function inlineSyntaxEditorExtension(plugin: IgnorancePlugin) {
  return ViewPlugin.fromClass(class {
    value: InlineSyntaxDecorations;
    constructor(view: EditorView) { this.value = buildInlineSyntaxDecorations(view, plugin); }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.value = buildInlineSyntaxDecorations(update.view, plugin, this.value);
      }
    }
  }, { decorations: (view: { value: InlineSyntaxDecorations }) => view.value.decorations });
}

export { InlineSyntaxWidget, buildInlineSyntaxDecorations, inlineSyntaxEditorExtension };
