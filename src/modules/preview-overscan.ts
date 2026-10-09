// Obsidian's progressive preview detaches sections outside its render window.
// Keep a bounded extra screen ready before a fast wheel movement arrives.
export function widenPreviewWindow(renderer) {
  if (!renderer || !Number.isFinite(renderer.renderExtra) || !Number.isFinite(renderer.renderExtraMinPx)) return null;
  const original = { renderExtra: renderer.renderExtra, renderExtraMinPx: renderer.renderExtraMinPx };
  const applied = { renderExtra: Math.max(original.renderExtra, 2), renderExtraMinPx: Math.max(original.renderExtraMinPx, 1200) };
  renderer.renderExtra = applied.renderExtra;
  renderer.renderExtraMinPx = applied.renderExtraMinPx;
  return () => {
    for (const key of Object.keys(original)) if (renderer[key] === applied[key]) renderer[key] = original[key];
  };
}

export function installPreviewOverscan(plugin) {
  const installed = new Map();
  let frame = 0;
  let timer = 0;
  const apply = () => {
    frame = 0;
    const current = new Set();
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const renderer = leaf.view?.previewMode?.renderer;
      if (!renderer) continue;
      current.add(renderer);
      if (installed.has(renderer)) continue;
      const restore = widenPreviewWindow(renderer);
      if (!restore) continue;
      installed.set(renderer, restore);
      if (leaf.view.getMode?.() === "preview" && leaf.view.containerEl.checkVisibility() && !leaf.view.containerEl.querySelector(".ibp-book")) {
        renderer.updateVirtualDisplay?.();
      }
    }
    for (const [renderer, restore] of installed) if (!current.has(renderer)) { restore(); installed.delete(renderer); }
  };
  // Let initial layout publish its first screen before warming extra sections.
  // Coalesce rather than debounce: frequent layout events must not starve it.
  const schedule = () => {
    if (frame || timer) return;
    timer = window.setTimeout(() => { timer = 0; frame = requestAnimationFrame(apply); }, 600);
  };
  for (const event of ["layout-change", "active-leaf-change", "file-open"]) plugin.registerEvent(plugin.app.workspace.on(event, schedule));
  plugin.app.workspace.onLayoutReady(schedule);
  plugin.register(() => { clearTimeout(timer); cancelAnimationFrame(frame); for (const restore of installed.values()) restore(); installed.clear(); });
}
