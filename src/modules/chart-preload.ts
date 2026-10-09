import MarkdownIt from "markdown-it";
import { preloadEChartsPreview } from "./echarts-renderer.js";
const markdown = new MarkdownIt();
export function installChartPreload(plugin) {
  let generation = 0, idleId = 0, serial = 0;
  const idle = () => new Promise<void>(resolve => {
    if (window.requestIdleCallback) window.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 40);
  });
  const warm = async (file, token) => {
    if (!file || file.extension !== "md") return;
    const source = await plugin.app.vault.cachedRead(file);
    const fences = markdown.parse(source, {}).filter(t => t.type === "fence" && /^(mermaid|echarts)\b/i.test(t.info));
    for (const fence of fences) {
      await idle();
      if (token !== generation) return;
      // Await first-screen layout and exports before spending idle time on charts.
      while (document.body.dataset.ibThemeCapture || document.querySelector('.ibp-book[data-ibp-progress="initial"],.ibp-book[data-ibp-progress="partial"]')) { await new Promise(r => setTimeout(r, 200)); if (token !== generation) return; }
      try {
        if (/^echarts\b/i.test(fence.info)) await preloadEChartsPreview(plugin, fence.content.trim());
        else { const engine = await plugin.ensureMermaid(); await engine.render(`ibpreload${++serial}`, fence.content.trim()); }
      } catch (_) { /* Invalid authored diagrams remain visible as normal renderer errors. */ }
    }
  };
  const schedule = file => {
    if (document.body.dataset.ibThemeCapture) return;
    const token = ++generation;
    clearTimeout(idleId);
    const run = () => { void warm(file, token).catch(() => {}); };
    // Give visible content priority; then progressively cache the rest of this note.
    idleId = window.setTimeout(run, 1200);
  };
  plugin.registerEvent(plugin.app.workspace.on("file-open", schedule));
  plugin.registerDomEvent(window, "ib-theme-change", () => schedule(plugin.app.workspace.getActiveFile()));
  plugin.registerEvent(plugin.app.vault.on("modify", file => { if (file === plugin.app.workspace.getActiveFile()) schedule(file); }));
  plugin.app.workspace.onLayoutReady(() => schedule(plugin.app.workspace.getActiveFile()));
  plugin.register(() => { generation++; clearTimeout(idleId); });
}
