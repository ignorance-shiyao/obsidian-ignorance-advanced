import { MarkdownView,Notice,Platform } from "obsidian";
import { loadBundledMermaid,paintDiagram,t } from "../modules/mermaid-core.js";
import { createMermaidRenderQueue } from "../modules/mermaid-render-queue.js";
import { guardedCleanup,restoreGlobalProperty } from "../modules/plugin-cleanup.js";
import type { IgnorancePlugin } from "../plugin-types.js";

// Mermaid's built-in edge animations (see styles.css for the shared copies).
const MERMAID_KEYFRAMES = /@keyframes\s+(?:edge-animation-frame|dash)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

/* Mermaid loading: the bundled Mermaid is unpacked on first use, and diagrams drawn before the theme settled are redrawn. */

/* Obsidian only calls mermaid.initialize() and mermaid.render(). Stand in
   for the global right away with a light router, and read and evaluate the
   bundled Mermaid (the slowest part of startup, especially on mobile) the
   first time a diagram is drawn. Desktop warms it up once the app is idle. */
export function installLazyMermaid(plugin: IgnorancePlugin) {
  const previous = {
    mermaid: window.mermaid,
    descriptor: Object.getOwnPropertyDescriptor(window, "mermaid")
  };
  const configs = [];
  const overwrites = [];
  let engine = null;
  let loading = null;
  const ensure = () => loading ||= loadBundledMermaid(plugin, { publish: false })
    .then(({ mermaid }) => {
      // Each diagram's <style> declares the same global @keyframes; inserting
      // or cloning one made Chrome restyle the whole document (~0.3s on a
      // long note, per diagram). They live once in styles.css instead.
      const render = mermaid.render.bind(mermaid);
      const draw = async (...args) => {
        const result = await render(...args);
        if (typeof result?.svg === "string") result.svg = result.svg.replace(MERMAID_KEYFRAMES, "");
        return result;
      };
      // Obsidian 1.14 registers two post processors for mermaid blocks, so
      // every diagram was drawn twice and one copy thrown away. A request
      // matching one already in flight shares its drawing, with the ids
      // swapped so each copy stays unique.
      // Visible source placeholders jump ahead of offscreen/background
      // diagrams; Obsidian's hidden scratch div is never the priority target.
      mermaid.render = createMermaidRenderQueue(draw);
      configs.forEach(config => mermaid.initialize(config));
      plugin.bundledMermaid = engine = mermaid;
      return mermaid;
    })
    .catch(error => {
      console.error("Ignorance Advanced: keeping Obsidian's Mermaid —", error);
      new Notice(t("mermaidLoadFailed"));
      // Fall back to the Mermaid Obsidian published meanwhile, if any.
      const fallback = overwrites[overwrites.length - 1] || previous.mermaid;
      if (!fallback) throw error;
      configs.forEach(config => fallback.initialize?.(config));
      return engine = fallback;
    });
  const lazy = {
    initialize: config => { if (engine) engine.initialize(config); else configs.push(config); },
    parse: async (...args) => (await ensure()).parse(...args),
    render: async (...args) => (await ensure()).render(...args)
  };
  Object.defineProperty(window, "mermaid", {
    configurable: true,
    enumerable: true,
    get: () => engine || lazy,
    set: value => { overwrites.push(value); }
  });
  plugin.ensureMermaid = ensure;
  plugin.register(() => {
    const native = overwrites[overwrites.length - 1] || previous.mermaid;
    const descriptor = previous.descriptor || (native ? { value: native, writable: true, configurable: true, enumerable: true } : undefined);
    guardedCleanup(() => restoreGlobalProperty(window, "mermaid", descriptor), "恢复 Mermaid")();
    // __esbuild_esm_mermaid_nm belongs to Obsidian's lazy loader. Our bundle
    // evaluates it locally, so unloading must not delete or clear the
    // native loader that appeared after plugin startup.
  });
  if (!Platform.isMobile) {
    plugin.app.workspace.onLayoutReady(() => {
      const warm = () => ensure().catch(() => {});
      if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 8000 });
      else window.setTimeout(warm, 3000);
    });
  }
}

/* Obsidian restores open notes before this plugin finishes loading, so some
   diagrams get drawn by its built-in Mermaid first. Reading view re-renders
   on its own; Live Preview keeps a diagram widget as long as its source is
   unchanged, so rebuild any note that still shows an unstamped diagram. */
export function redrawStaleDiagrams(plugin: IgnorancePlugin) {
  const stale = ".mermaid svg:not([data-ibm-engine])";
  plugin.app.workspace.iterateAllLeaves(leaf => {
    if (!(leaf.view instanceof MarkdownView)) return;
    if (!leaf.view.containerEl.querySelector(stale)) return;
    leaf.rebuildView?.();
  });
}

export function isDarkTheme(plugin: IgnorancePlugin) {
  return document.body.classList.contains("theme-dark");
}

export function repaintAll(plugin: IgnorancePlugin, force = false) {
  const isDark = plugin.isDarkTheme();
  for (const element of document.querySelectorAll(".mermaid.ibm-mermaid-enhanced > svg, .mermaid.ibm-mermaid-enhanced > .ibm-mermaid-canvas > svg")) {
    if (document.body.dataset.ibThemeCapture && !element.closest(".ibp-export,.ibp-staging")) continue;
    if (!force && element.getAttribute("data-ibm-theme") === (isDark ? "dark" : "light")) continue;
    paintDiagram(element, isDark);
  }
}
