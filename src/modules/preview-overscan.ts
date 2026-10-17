import { MarkdownView } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";

// Obsidian's preview renderer is not in the published typings; this is the slice used here.
interface PreviewRenderer { renderExtra: number; renderExtraMinPx: number; updateVirtualDisplay?(): void }
// Obsidian's progressive preview detaches sections outside its render window.
// Keep a bounded extra screen ready before a fast wheel movement arrives.
export function widenPreviewWindow(renderer: PreviewRenderer | null | undefined) {
  if (!renderer || !Number.isFinite(renderer.renderExtra) || !Number.isFinite(renderer.renderExtraMinPx)) return null;
  const original = { renderExtra: renderer.renderExtra, renderExtraMinPx: renderer.renderExtraMinPx };
  const applied = { renderExtra: Math.max(original.renderExtra, 2), renderExtraMinPx: Math.max(original.renderExtraMinPx, 1200) };
  renderer.renderExtra = applied.renderExtra;
  renderer.renderExtraMinPx = applied.renderExtraMinPx;
  return () => {
    for (const key of ["renderExtra", "renderExtraMinPx"] as const) if (renderer[key] === applied[key]) renderer[key] = original[key];
  };
}

export function installPreviewOverscan(plugin: IgnorancePlugin) {
  const installed = new Map<PreviewRenderer, () => void>();
  let frame = 0;
  let timer = 0;
  const apply = () => {
    frame = 0;
    const current = new Set<PreviewRenderer>();
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const renderer = (view.previewMode as { renderer?: PreviewRenderer }).renderer;
      if (!renderer) continue;
      current.add(renderer);
      if (installed.has(renderer)) continue;
      const restore = widenPreviewWindow(renderer);
      if (!restore) continue;
      installed.set(renderer, restore);
      if (view.getMode() === "preview" && view.containerEl.checkVisibility() && !view.containerEl.querySelector(".ibp-book")) {
        renderer.updateVirtualDisplay?.();
      }
    }
    for (const [renderer, restore] of installed) if (!current.has(renderer)) { restore(); installed.delete(renderer); }
  };
  // Let initial layout publish its first screen before warming extra sections.
  // Coalesce rather than debounce: frequent layout events must not starve it.
  const schedule = () => {
    if (frame || timer) return;
    timer = window.setTimeout(() => { timer = 0; frame = window.requestAnimationFrame(apply); }, 600);
  };
  plugin.registerEvent(plugin.app.workspace.on("layout-change", schedule));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", schedule));
  plugin.registerEvent(plugin.app.workspace.on("file-open", schedule));
  plugin.app.workspace.onLayoutReady(schedule);
  plugin.register(() => { window.clearTimeout(timer); cancelAnimationFrame(frame); for (const restore of installed.values()) restore(); installed.clear(); });
}
