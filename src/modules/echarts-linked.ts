import { Component, MarkdownRenderChild } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { renderEChartsBlock, setChartError } from "./echarts-renderer.js";
import { resolveChartSource, splitChartSource } from "./echarts-table-core.js";
/* Charts whose first line is `source: {#id}` read their data from a table in the same note and redraw when
   that note changes. Blocks without the line go straight to the normal renderer. */
export function renderLinkedEChartsBlock(plugin: IgnorancePlugin, source: string, element: HTMLElement, context: MarkdownPostProcessorContext) {
  if (!splitChartSource(source).id) { renderEChartsBlock(plugin, source, element, context); return; }
  const holder = new MarkdownRenderChild(element);
  context.addChild(holder);
  let current: Component | null = null;
  let last = "";
  const innerContext = Object.assign(Object.create(context) as MarkdownPostProcessorContext, {
    addChild: <T extends Component>(child: T) => { current = child; holder.addChild(child); return child; }
  });
  const draw = async () => {
    const file = plugin.app.vault.getFileByPath(context.sourcePath);
    if (!file) return;
    let resolved = "";
    try { resolved = resolveChartSource(source, await plugin.app.vault.cachedRead(file)); }
    catch (error) {
      if (current) { holder.removeChild(current); current = null; }
      last = "";
      setChartError(element, error);
      return;
    }
    if (resolved === last) return;
    last = resolved;
    if (current) { holder.removeChild(current); current = null; }
    element.replaceChildren();
    renderEChartsBlock(plugin, resolved, element, innerContext);
  };
  let timer = 0;
  holder.registerEvent(plugin.app.metadataCache.on("changed", changed => {
    if (changed.path !== context.sourcePath) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void draw(); }, 400);
  }));
  holder.register(() => window.clearTimeout(timer));
  void draw();
}
