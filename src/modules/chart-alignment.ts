import { applyTableSourceAlignment } from "./table-alignment.js";
import { setIcon, UI_ICONS } from "./ui-icons.js";
import { saveErrorMessage, holdScrollPosition, replaceLineQuietly } from "./quiet-edit.js";
import MarkdownIt from "markdown-it";
import { chartWidth, withChartWidth, setBlockWidth, MIN_BLOCK_WIDTH } from "./block-width.js";
const { Menu, Notice, MarkdownView } = require("obsidian");
export function chartAlignment(fence: string) { return fence.match(/\{align=(left|center|right)\}/)?.[1] || "center"; }
export function withChartAlignment(fence: string, alignment: string) {
  const clean = fence.replace(/\s*\{align=(?:left|center|right)\}/g, "").trimEnd();
  return `${clean} {align=${alignment}}`;
}
const fenceMapAt = (source, line) => new MarkdownIt().parse(source, {}).find(token => token.type === "fence" && token.map[0] <= line && line < token.map[1])?.map;
const fenceAt = (source, line) => fenceMapAt(source, line)?.[0];
// Blocks inside a Markdown preview block are fences nested in the outer fence's body.
const NESTED_BLOCKS = "pre.ibc-enhanced, .mermaid, .ib-echarts-block";
export function mountChartAlignment(plugin, container, actions) {
  const apply = alignment => {
    container.dataset.ibChartAlign = alignment;
    const wrapper = container.closest(".cm-embed-block");
    if (wrapper) wrapper.dataset.ibChartAlign = alignment;
  };
  apply(container.closest("[data-ib-chart-align]")?.dataset.ibChartAlign || "center");
  const label = container.tagName === "PRE" ? "代码块位置" : "图表位置";
  const button = actions.createEl("button", { cls: "ib-chart-align", attr: { type: "button", "aria-label": label, title: label } });
  setIcon(button, UI_ICONS.alignCenter);
  const locateIn = async element => {
    const stored = plugin.storedSourceFor(element);
    if (stored) {
      const file = plugin.app.vault.getAbstractFileByPath(stored.path);
      if (!file) return null;
      const active = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = active?.file?.path === stored.path && active.getMode() === "source" ? active.editor : null;
      const source = editor ? editor.getValue() : await plugin.app.vault.cachedRead(file), lines = source.split("\n");
      const line = fenceAt(source, stored.lineStart);
      if (line !== undefined && line <= stored.lineEnd) return { file, editor, lines, line };
    }
    const view = plugin.app.workspace.getActiveViewOfType(MarkdownView), cm = view?.editor?.cm;
    if (!cm) return null;
    const lines = cm.state.doc.toString().split("\n");
    const position = cm.state.doc.lineAt(cm.posAtDOM(element)).number - 1;
    const line = fenceAt(lines.join("\n"), position);
    return line === undefined ? null : { editor: view.editor, lines, line };
  };
  const locate = async () => {
    const host = container.closest(".ibm-markdown-preview-block");
    if (!host || host === container) return locateIn(container);
    // Nested block: find the outer fence, then the n-th fence inside its body.
    const outer = await locateIn(host);
    if (!outer) return null;
    const preview = container.closest(".ibm-markdown-preview");
    const ordinal = [...(preview || host).querySelectorAll(NESTED_BLOCKS)].filter(el => el.closest(".ibm-markdown-preview") === preview).indexOf(container);
    const map = fenceMapAt(outer.lines.join("\n"), outer.line);
    if (ordinal < 0 || !map) return null;
    const inner = new MarkdownIt().parse(outer.lines.slice(map[0] + 1, map[1] - 1).join("\n"), {}).filter(token => token.type === "fence")[ordinal];
    return inner ? { ...outer, line: map[0] + 1 + inner.map[0] } : null;
  };
  // The fence is the shared source of truth for every view and exported copy.
  void locate().then(found => { if (found && container.isConnected) { apply(chartAlignment(found.lines[found.line])); setBlockWidth(container, chartWidth(found.lines[found.line])); } }).catch(() => {});
  mountResizeHandles(plugin, container, locate);
  button.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    const menu = new Menu();
    for (const [id, label] of [["left", "居左"], ["center", "居中"], ["right", "居右"]]) menu.addItem(item => item.setTitle(label).setIcon(UI_ICONS[{ left: "alignLeft", center: "alignCenter", right: "alignRight" }[id]]).setChecked(container.dataset.ibChartAlign === id).onClick(async () => {
      const previous = container.dataset.ibChartAlign || "center";
      // Position is pure CSS: show it at once, then persist the fence marker. Saving rewrites the
      // note, which re-renders it, so the reading position is held until that settles.
      const release = holdScrollPosition(container);
      apply(id);
      try {
        const found = await locate();
        if (!found) throw new Error("未找到块源代码位置");
        const fence = withChartAlignment(found.lines[found.line], id);
        if (found.editor) replaceLineQuietly(found.editor, found.line, fence);
        else { found.lines[found.line] = fence; await plugin.app.vault.process(found.file, () => found.lines.join("\n")); }
      } catch (error) { release(); apply(previous); new Notice(`块位置未保存：${saveErrorMessage(error)}`); }
    }));
    const box = button.getBoundingClientRect(); menu.showAtPosition({ x: box.left, y: box.bottom + 4 });
  });
}


// Drag a block's side edge to set its width. The new width lives on the fence like the position.
function mountResizeHandles(plugin, container, locate) {
  container.querySelectorAll(":scope > .ib-block-resize").forEach(node => node.remove());
  for (const side of ["west", "east"]) {
    const handle = container.createDiv({ cls: `ib-block-resize is-${side}` });
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", event => {
      if (event.button) return;
      event.preventDefault(); event.stopPropagation();
      const start = event.clientX, box = container.getBoundingClientRect();
      // The text column, not the block's wrapper: the wrapper shrinks to its content.
      const host = container.closest(".cm-content, .markdown-preview-sizer, .markdown-preview-view") || container.parentElement;
      const hostStyle = host ? getComputedStyle(host) : null;
      const column = host ? host.clientWidth - (parseFloat(hostStyle.paddingLeft) || 0) - (parseFloat(hostStyle.paddingRight) || 0) : box.width;
      const limit = Math.max(box.width, column);
      const align = container.dataset.ibChartAlign || "center";
      // Centred blocks grow on both sides, so the edge under the pointer moves at half speed.
      const factor = align === "center" ? 2 : 1;
      const previous = Number(container.dataset.ibChartWidth) || 0;
      let width = box.width;
      handle.setPointerCapture(event.pointerId);
      container.classList.add("is-resizing");
      const move = move => {
        const delta = (side === "east" ? move.clientX - start : start - move.clientX) * factor;
        width = Math.round(Math.min(limit, Math.max(MIN_BLOCK_WIDTH, box.width + delta)));
        setBlockWidth(container, width);
      };
      const end = async finish => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", cancel);
        container.classList.remove("is-resizing");
        refit(plugin, container);
        if (finish.type === "pointercancel") { setBlockWidth(container, previous); refit(plugin, container); return; }
        if (Math.abs(width - box.width) < 2) return;
        await persistWidth(plugin, container, locate, width, previous);
      };
      const cancel = event => end(event);
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", cancel);
    });
    // Double-click gives the block its natural width back.
    handle.addEventListener("dblclick", async event => {
      event.preventDefault(); event.stopPropagation();
      const previous = Number(container.dataset.ibChartWidth) || 0;
      if (!previous) return;
      setBlockWidth(container, 0); refit(plugin, container);
      await persistWidth(plugin, container, locate, 0, previous);
    });
  }
}

function refit(plugin, container) {
  const state = plugin.diagramStates?.get(container);
  if (state && !state.disposed) plugin.scheduleRetighten(container, state, state.svg);
}

async function persistWidth(plugin, container, locate, width, previous) {
  const release = holdScrollPosition(container);
  try {
    const found = await locate();
    if (!found) throw new Error("未找到块源代码位置");
    const fence = withChartWidth(found.lines[found.line], width);
    if (found.editor) replaceLineQuietly(found.editor, found.line, fence);
    else { found.lines[found.line] = fence; await plugin.app.vault.process(found.file, () => found.lines.join("\n")); }
  } catch (error) {
    release(); setBlockWidth(container, previous); refit(plugin, container);
    new Notice(`块宽度未保存：${saveErrorMessage(error)}`);
  }
}

// Staged readers and slides do not expose native section line information.
export async function applyStagedChartAlignment(plugin, root, sourcePath, source) {
  applyTableSourceAlignment(root, source);
  if (!root.querySelector(".mermaid,.ib-echarts-block")) return;
  const fences = new MarkdownIt().parse(source, {}).filter(t => t.type === "fence" && /^(?:mermaid|echarts)\b/i.test(t.info));
  const queues = { mermaid: [], echarts: [] };
  const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
  const whole = file ? await plugin.app.vault.cachedRead(file) : "";
  const offset = whole.indexOf(source);
  const baseLine = offset >= 0 && offset === whole.lastIndexOf(source) ? whole.slice(0, offset).split("\n").length - 1 : null;
  for (const fence of fences) queues[fence.info.match(/^(mermaid|echarts)/i)[1].toLowerCase()].push(fence);
  for (const block of root.querySelectorAll(".mermaid,.ib-echarts-block")) {
    const type = block.classList.contains("ib-echarts-block") ? "echarts" : "mermaid";
    const fence = queues[type].shift();
    block.dataset.ibChartAlign = fence ? chartAlignment(fence.info) : "center";
    setBlockWidth(block, fence ? chartWidth(fence.info) : 0);
    if (fence && baseLine !== null) {
      plugin.blockSources ||= new WeakMap();
      plugin.blockSources.set(block, {path:sourcePath, lineStart:baseLine+fence.map[0],lineEnd:baseLine+fence.map[1]-1});
    }
  }
}
