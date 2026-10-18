import { controlScale } from "./control-geometry.js";
import type { RenderingContext } from "../rendering-context.js";
import { Menu, Notice, MarkdownView, TFile, type Editor } from "obsidian";
import { applyTableSourceAlignment } from "./table-alignment.js";
import { setIcon, UI_ICONS } from "./ui-icons.js";
import { saveErrorMessage, holdScrollPosition, replaceLineQuietly } from "./quiet-edit.js";
import MarkdownIt from "markdown-it";
import { chartWidth, withChartWidth, setBlockWidth, MIN_BLOCK_WIDTH } from "./block-width.js";
export function chartAlignment(fence: string) { return fence.match(/\{align=(left|center|right)\}/)?.[1] || "center"; }
export function withChartAlignment(fence: string, alignment: string) {
  const clean = fence.replace(/\s*\{align=(?:left|center|right)\}/g, "").trimEnd();
  return `${clean} {align=${alignment}}`;
}
type FenceToken = ReturnType<MarkdownIt["parse"]>[number];
// Where a block's fence sits: the note's lines, the fence line, and who can rewrite it (the open editor, or the file).
interface LocatedFence { file?: TFile; editor: Editor | null; lines: string[]; line: number }
const ALIGN_ICONS: Record<string, keyof typeof UI_ICONS> = { left: "alignLeft", center: "alignCenter", right: "alignRight" };
const fenceMapAt = (source: string, line: number) => new MarkdownIt().parse(source, {}).find(token => token.type === "fence" && token.map !== null && token.map[0] <= line && line < token.map[1])?.map;
const fenceAt = (source: string, line: number) => fenceMapAt(source, line)?.[0];
// Blocks inside a Markdown preview block are fences nested in the outer fence's body.
const NESTED_BLOCKS = "pre.ibc-enhanced, .mermaid, .ib-echarts-block";
export function mountChartAlignment(plugin: RenderingContext, container: HTMLElement, actions: HTMLDivElement) {
  const apply = (alignment: string) => {
    container.dataset.ibChartAlign = alignment;
    const wrapper = container.closest<HTMLElement>(".cm-embed-block");
    if (wrapper) wrapper.dataset.ibChartAlign = alignment;
  };
  apply(container.closest<HTMLElement>("[data-ib-chart-align]")?.dataset.ibChartAlign || "center");
  const label = container.tagName === "PRE" ? "代码块位置" : "图表位置";
  const button = actions.createEl("button", { cls: "ib-chart-align", attr: { type: "button", "aria-label": label, title: label } });
  setIcon(button, UI_ICONS.alignCenter);
  const locateIn = async (element: HTMLElement): Promise<LocatedFence | null> => {
    const stored = plugin.storedSourceFor(element);
    if (stored) {
      const file = plugin.app.vault.getAbstractFileByPath(stored.path);
      if (!(file instanceof TFile)) return null;
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
  const locate = async (): Promise<LocatedFence | null> => {
    const host = container.closest<HTMLElement>(".ibm-markdown-preview-block");
    if (!host || host === container) return locateIn(container);
    // Nested block: find the outer fence, then the n-th fence inside its body.
    const outer = await locateIn(host);
    if (!outer) return null;
    const preview = container.closest(".ibm-markdown-preview");
    const ordinal = [...(preview || host).querySelectorAll<HTMLElement>(NESTED_BLOCKS)].filter(el => el.closest(".ibm-markdown-preview") === preview).indexOf(container);
    const map = fenceMapAt(outer.lines.join("\n"), outer.line);
    if (ordinal < 0 || !map) return null;
    const inner = new MarkdownIt().parse(outer.lines.slice(map[0] + 1, map[1] - 1).join("\n"), {}).filter(token => token.type === "fence")[ordinal];
    return inner?.map ? { ...outer, line: map[0] + 1 + inner.map[0] } : null;
  };
  // The fence is the shared source of truth for every view and exported copy.
  void locate().then(found => { if (found && container.isConnected) { apply(chartAlignment(found.lines[found.line])); setBlockWidth(container, chartWidth(found.lines[found.line])); } }).catch(() => {});
  mountResizeHandles(plugin, container, locate);
  button.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    const menu = new Menu();
    const choose = async (id: string) => {
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
        else { if (!found.file) throw Error("未找到块所在文件"); found.lines[found.line] = fence; await plugin.app.vault.process(found.file, () => found.lines.join("\n")); }
      } catch (error) { release(); apply(previous); new Notice(`块位置未保存：${saveErrorMessage(error)}`); }
    };
    for (const [id, label] of [["left", "居左"], ["center", "居中"], ["right", "居右"]]) menu.addItem(item => item.setTitle(label).setIcon(UI_ICONS[ALIGN_ICONS[id]]).setChecked(container.dataset.ibChartAlign === id).onClick(() => { void choose(id); }));
    const box = button.getBoundingClientRect(); menu.showAtPosition({ x: box.left, y: box.bottom + 4 });
  });
}


// Drag a block's side edge to set its width. The new width lives on the fence like the position.
function mountResizeHandles(plugin: RenderingContext, container: HTMLElement, locate: () => Promise<LocatedFence | null>) {
  container.querySelectorAll<HTMLElement>(":scope > .ib-block-resize").forEach(node => node.remove());
  for (const side of ["west", "east"]) {
    const handle = container.createDiv({ cls: `ib-block-resize is-${side}` });
    handle.setAttribute("aria-hidden", "true");
    handle.addEventListener("pointerdown", event => {
      if (event.button) return;
      event.preventDefault(); event.stopPropagation();
      const start = event.clientX, scale = controlScale(container);
      const initialWidth = container.getBoundingClientRect().width / scale;
      // The text column, not the block's wrapper: the wrapper shrinks to its content.
      const host = container.closest<HTMLElement>(".cm-content, .markdown-preview-sizer, .markdown-preview-view") || container.parentElement;
      const hostStyle = host ? getComputedStyle(host) : null;
      const column = host ? host.clientWidth - (parseFloat(hostStyle?.paddingLeft || "0") || 0) - (parseFloat(hostStyle?.paddingRight || "0") || 0) : initialWidth;
      const limit = Math.max(initialWidth, column);
      const align = container.dataset.ibChartAlign || "center";
      // Centred blocks grow on both sides, so the edge under the pointer moves at half speed.
      const factor = align === "center" ? 2 : 1;
      const previous = Number(container.dataset.ibChartWidth) || 0;
      let width = initialWidth;
      handle.setPointerCapture(event.pointerId);
      container.classList.add("is-resizing");
      const move = (moveEvent: PointerEvent) => {
        const delta = (side === "east" ? moveEvent.clientX - start : start - moveEvent.clientX) * factor / scale;
        width = Math.round(Math.min(limit, Math.max(MIN_BLOCK_WIDTH, initialWidth + delta)));
        setBlockWidth(container, width);
      };
      const end = (finish: PointerEvent) => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", cancel);
        container.classList.remove("is-resizing");
        refit(plugin, container);
        if (finish.type === "pointercancel") { setBlockWidth(container, previous); refit(plugin, container); return; }
        if (Math.abs(width - initialWidth) < 2) return;
        void persistWidth(plugin, container, locate, width, previous);
      };
      const cancel = (cancelEvent: PointerEvent) => end(cancelEvent);
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", cancel);
    });
    // Double-click gives the block its natural width back.
    handle.addEventListener("dblclick", event => {
      event.preventDefault(); event.stopPropagation();
      const previous = Number(container.dataset.ibChartWidth) || 0;
      if (!previous) return;
      setBlockWidth(container, 0); refit(plugin, container);
      void persistWidth(plugin, container, locate, 0, previous);
    });
  }
}

function refit(plugin: RenderingContext, container: HTMLElement) {
  const state = plugin.diagramStates?.get(container);
  if (state && !state.disposed) plugin.scheduleRetighten(container, state, state.svg);
}

async function persistWidth(plugin: RenderingContext, container: HTMLElement, locate: () => Promise<LocatedFence | null>, width: number, previous: number) {
  const release = holdScrollPosition(container);
  try {
    const found = await locate();
    if (!found) throw new Error("未找到块源代码位置");
    const fence = withChartWidth(found.lines[found.line], width);
    if (found.editor) replaceLineQuietly(found.editor, found.line, fence);
    else { if (!found.file) throw Error("未找到块所在文件"); found.lines[found.line] = fence; await plugin.app.vault.process(found.file, () => found.lines.join("\n")); }
  } catch (error) {
    release(); setBlockWidth(container, previous); refit(plugin, container);
    new Notice(`块宽度未保存：${saveErrorMessage(error)}`);
  }
}

// Staged readers and slides do not expose native section line information.
export async function applyStagedChartAlignment(plugin: RenderingContext, root: HTMLElement, sourcePath: string, source: string) {
  applyTableSourceAlignment(root, source);
  if (!root.querySelector(".mermaid,.ib-echarts-block")) return;
  const fences = new MarkdownIt().parse(source, {}).filter(t => t.type === "fence" && /^(?:mermaid|echarts)\b/i.test(t.info));
  const queues: Record<string, FenceToken[]> = { mermaid: [], echarts: [] };
  const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
  const whole = file instanceof TFile ? await plugin.app.vault.cachedRead(file) : "";
  const offset = whole.indexOf(source);
  const baseLine = offset >= 0 && offset === whole.lastIndexOf(source) ? whole.slice(0, offset).split("\n").length - 1 : null;
  for (const fence of fences) {
    const type = fence.info.match(/^(mermaid|echarts)/i)?.[1].toLowerCase();
    if (type) queues[type].push(fence);
  }
  for (const block of root.querySelectorAll<HTMLElement>(".mermaid,.ib-echarts-block")) {
    const type = block.classList.contains("ib-echarts-block") ? "echarts" : "mermaid";
    const fence = queues[type].shift();
    block.dataset.ibChartAlign = fence ? chartAlignment(fence.info) : "center";
    setBlockWidth(block, fence ? chartWidth(fence.info) : 0);
    if (fence?.map && baseLine !== null) {
      plugin.blockSources ||= new WeakMap();
      plugin.blockSources.set(block, {path:sourcePath, lineStart:baseLine+fence.map[0],lineEnd:baseLine+fence.map[1]-1});
    }
  }
}
