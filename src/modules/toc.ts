import { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { editorInfoField, MarkdownView } from "obsidian";
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import { extractTocHeadings, isTocDirective, type TocItem } from "./toc-headings.js";

function tocHeadings(plugin: IgnorancePlugin, sourcePath: string) {
  const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
  const headings = (file instanceof TFile && plugin.app.metadataCache.getFileCache(file)?.headings) || [];
  return extractTocHeadings(headings);
}

function buildTocList(plugin: IgnorancePlugin, sourcePath: string, onPick: (heading: TocItem) => void) {
  const headings = tocHeadings(plugin, sourcePath);
  const nav = createDiv({ cls: "ibm-toc" });
  nav.createDiv({ cls: "ibm-toc-title", text: "目录" });
  if (!headings.length) {
    nav.createDiv({ cls: "ibm-toc-empty", text: "（暂无标题）" });
    return nav;
  }
  const top = Math.min(...headings.map(h => h.level));
  const list = nav.createEl("ul", { cls: "ibm-toc-list" });
  for (const h of headings) {
    const item = list.createEl("li", { cls: `ibm-toc-item ibm-toc-level-${h.level - top + 1}` });
    const link = item.createEl("a", { cls: "ibm-toc-link", text: h.text, href: `#${h.text}` });
    link.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      onPick(h);
    });
  }
  return nav;
}

function jumpToHeading(plugin: IgnorancePlugin, sourcePath: string, heading: TocItem) {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (view?.file?.path === sourcePath && view.getState?.().mode === "preview") {
    const target = [...view.containerEl.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")]
      .find(element => element.dataset.heading === heading.text || element.textContent.trim() === heading.text);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
  void plugin.app.workspace.openLinkText(`#${heading.text}`, sourcePath, false);
}

function renderTocBlocks(plugin: IgnorancePlugin, element: HTMLElement, sourcePath: string) {
  for (const p of element.querySelectorAll("p")) {
    const link = p.children.length === 1 ? p.firstElementChild as HTMLElement : null;
    const isWikiToc = link?.matches("a.internal-link")
      && link.dataset.href?.trim().toLowerCase() === "toc"
      && link.textContent.trim().toLowerCase() === "toc";
    if (!isTocDirective(p.textContent) && !isWikiToc) continue;
    p.replaceWith(buildTocList(plugin, sourcePath, h => jumpToHeading(plugin, sourcePath, h)));
  }
}

class TocWidget extends WidgetType {
  plugin: IgnorancePlugin;
  sourcePath: string;
  signature: string;
  constructor(plugin: IgnorancePlugin, sourcePath: string, signature: string) {
    super();
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.signature = signature;
  }
  eq(other: TocWidget) { return other.signature === this.signature && other.sourcePath === this.sourcePath; }
  toDOM(view: EditorView) {
    const nav = buildTocList(this.plugin, this.sourcePath, h => {
      const line = view.state.doc.line(Math.min(view.state.doc.lines, h.line + 1));
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      view.focus();
    });
    nav.addClass("is-editor");
    return nav;
  }
  ignoreEvent() { return true; }
}

function tocExtension(plugin: IgnorancePlugin) {
  const build = (view: EditorView) => {
    const file = view.state.field(editorInfoField, false)?.file;
    if (!file) return Decoration.none;
    const signature = JSON.stringify(tocHeadings(plugin, file.path));
    const cursorLines = new Set(view.state.selection.ranges.map(r => view.state.doc.lineAt(r.head).number));
    const ranges: Range<Decoration>[] = [];
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos);
        if (isTocDirective(line.text) && !cursorLines.has(line.number)) {
          ranges.push(Decoration.replace({ widget: new TocWidget(plugin, file.path, signature) }).range(line.from, line.to));
        }
        pos = line.to + 1;
      }
    }
    return Decoration.set(ranges);
  };
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    onMeta: (file: TFile) => void;
    constructor(view: EditorView) {
      this.decorations = build(view);
      // Headings change after the metadata cache catches up with an edit.
      this.onMeta = (file: TFile) => {
        if (view.state.field(editorInfoField, false)?.file === file) {
          this.decorations = build(view);
          try { view.dispatch({}); } catch { /* view already gone */ }
        }
      };
      plugin.app.metadataCache.on("changed", this.onMeta);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) this.decorations = build(update.view);
    }
    destroy() { plugin.app.metadataCache.off("changed", this.onMeta); }
  }, { decorations: v => v.decorations });
}


export {
  tocHeadings,
  buildTocList,
  jumpToHeading,
  renderTocBlocks,
  TocWidget,
  tocExtension
};
