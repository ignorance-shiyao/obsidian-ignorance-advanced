import { parseMarkdownContainers } from "./container-source.js";
import { renderMarkdownWithContainers } from "./containers.js";

const { Component, editorInfoField } = require("obsidian");
const { StateField } = require("@codemirror/state");
const { Decoration, EditorView, WidgetType } = require("@codemirror/view");

class ContainerWidget extends WidgetType {
  constructor(plugin, sourcePath, source) {
    super();
    this.plugin = plugin;
    this.sourcePath = sourcePath;
    this.source = source;
    this.mounts = new WeakMap();
  }

  eq(other) {
    return other.sourcePath === this.sourcePath && other.source === this.source;
  }

  toDOM() {
    const mount = document.createElement("div");
    mount.className = "ibc-container-editor-widget";
    const component = new Component();
    component.load();
    this.mounts.set(mount, component);
    renderMarkdownWithContainers(this.plugin, this.sourcePath, this.source, mount, component)
      .catch(error => {
        if (!this.mounts.has(mount)) return;
        console.error("Ignorance Advanced: 编辑器容器渲染失败 —", error);
        mount.replaceChildren();
        mount.createEl("pre", { cls: "ibc-container-editor-error", text: this.source });
      });
    return mount;
  }

  destroy(dom) {
    this.mounts.get(dom)?.unload();
    this.mounts.delete(dom);
  }

  ignoreEvent() { return true; }
}

function buildContainerDecorations(state, plugin, cached = {}) {
  const file = state.field(editorInfoField, false)?.file;
  const sourcePath = file?.path || null;
  const selectionSignature = state.selection.ranges.map(range => `${range.from}:${range.to}`).join(",");
  if (!sourcePath) return { source: null, sourcePath, selectionSignature, nodes: [], decorations: Decoration.none };

  const source = state.doc.toString();
  const nodes = cached.source === source ? cached.nodes : parseMarkdownContainers(source);
  const selection = state.selection.ranges;
  const ranges = [];
  for (const node of nodes) {
    const active = selection.some(range => range.empty
      ? range.from >= node.startOffset && range.from < node.closeEnd
      : range.from < node.closeEnd && range.to > node.startOffset);
    if (active) continue;
    const markdown = source.slice(node.startOffset, node.closeEnd);
    ranges.push(Decoration.replace({
      widget: new ContainerWidget(plugin, sourcePath, markdown),
      block: true
    }).range(node.startOffset, node.closeEnd));
  }
  return { source, sourcePath, selectionSignature, nodes, decorations: ranges.length ? Decoration.set(ranges, true) : Decoration.none };
}

function containerEditorExtension(plugin) {
  const field = StateField.define({
    create: state => buildContainerDecorations(state, plugin),
    update(value, transaction) {
      const sourcePath = transaction.state.field(editorInfoField, false)?.file?.path || null;
      const selectionSignature = transaction.state.selection.ranges.map(range => `${range.from}:${range.to}`).join(",");
      if (!transaction.docChanged && value.sourcePath === sourcePath && value.selectionSignature === selectionSignature) return value;
      return buildContainerDecorations(transaction.state, plugin, value);
    },
    provide: field => EditorView.decorations.from(field, value => value.decorations)
  });
  return field;
}

export { ContainerWidget, buildContainerDecorations, containerEditorExtension };
