import { MarkdownView, Notice, Platform, loadMermaid } from "obsidian";
import { createMermaidRouter, paintDiagram, t } from "../modules/mermaid-core.js";
import type { MermaidEngine } from "../modules/mermaid-core.js";
import { createMermaidRenderQueue } from "../modules/mermaid-render-queue.js";
import { guardedCleanup,restoreGlobalProperty } from "../modules/plugin-cleanup.js";
import type { IgnorancePlugin } from "../plugin-types.js";

// Mermaid's built-in edge animations (see styles.css for the shared copies).
const MERMAID_KEYFRAMES = /@keyframes\s+(?:edge-animation-frame|dash)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

/* Mermaid loading: Obsidian's own Mermaid is loaded on first use and wrapped in the router, and diagrams drawn before the theme settled are redrawn. */

/* Obsidian only calls mermaid.initialize() and mermaid.render(). Stand in
   for the global right away with a light router, and load Obsidian's Mermaid
   (the slowest part of startup, especially on mobile) the first time a
   diagram is drawn. Desktop warms it up once the app is idle. */
// Whether a value is a usable Mermaid engine (Obsidian's script assigns the real one to the global).
function isEngine(value: unknown): value is MermaidEngine {
  const candidate = value as Partial<Record<keyof MermaidEngine, unknown>> | null | undefined;
  return typeof candidate === "object" && candidate !== null && typeof candidate.render === "function" && typeof candidate.initialize === "function";
}

export function installLazyMermaid(plugin: IgnorancePlugin) {
  const previous = {
    mermaid: window.mermaid as unknown,
    descriptor: Object.getOwnPropertyDescriptor(window, "mermaid")
  };
  const configs: unknown[] = [];
  const overwrites: MermaidEngine[] = [];
  let engine: MermaidEngine | null = null;
  let loading: Promise<MermaidEngine> | null = null;
  // loadMermaid() resolves with the global, which is this stand-in; the real
  // engine is what Obsidian's script assigned to it (or what was there first).
  const native = () => overwrites[overwrites.length - 1] || (isEngine(previous.mermaid) ? previous.mermaid : undefined);
  const ensure = () => loading ||= loadMermaid()
    .then(() => {
      const original = native();
      if (!original || typeof original.render !== "function") throw new Error("Obsidian's Mermaid is unavailable");
      const mermaid = createMermaidRouter(plugin, original);
      // Each diagram's <style> declares the same global @keyframes; inserting
      // or cloning one made Chrome restyle the whole document (~0.3s on a
      // long note, per diagram). They live once in styles.css instead.
      const render = mermaid.render.bind(mermaid) as MermaidEngine["render"];
      const draw = async (...args: Parameters<Parameters<typeof createMermaidRenderQueue>[0]>) => {
        const result = await render(...args);
        return typeof result?.svg === "string" ? { ...result, svg: result.svg.replace(MERMAID_KEYFRAMES, "") } : { ...result };
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
      const fallback = native();
      if (!fallback) throw error;
      configs.forEach(config => fallback.initialize?.(config));
      return engine = fallback;
    });
  const lazy = {
    initialize: (config: unknown) => { if (engine) engine.initialize(config); else configs.push(config); },
    parse: async (...args: unknown[]) => (await ensure()).parse(...args),
    render: async (id: string, text: string, ...rest: unknown[]) => (await ensure()).render(id, text, ...rest)
  };
  Object.defineProperty(window, "mermaid", {
    configurable: true,
    enumerable: true,
    get: () => engine || lazy,
    set: (value: MermaidEngine) => { overwrites.push(value); }
  });
  plugin.ensureMermaid = ensure;
  plugin.register(() => {
    const original = native();
    const descriptor = previous.descriptor || (original ? { value: original, writable: true, configurable: true, enumerable: true } : undefined);
    guardedCleanup(() => restoreGlobalProperty(window, "mermaid", descriptor), "恢复 Mermaid")();
    // The router configured Obsidian's shared engine; hand it back the
    // configuration Obsidian asked for.
    if (original) configs.forEach(config => original.initialize(config));
  });
  if (!Platform.isMobile) {
    plugin.app.workspace.onLayoutReady(() => {
      const warm = () => { ensure().catch(() => { /* the load error is already reported by ensure() */ }); };
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(warm, { timeout: 8000 });
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
  for (const element of document.querySelectorAll<SVGSVGElement>(".mermaid.ibm-mermaid-enhanced > svg, .mermaid.ibm-mermaid-enhanced > .ibm-mermaid-canvas > svg")) {
    if (document.body.dataset.ibThemeCapture && !element.closest(".ibp-export,.ibp-staging")) continue;
    if (!force && element.getAttribute("data-ibm-theme") === (isDark ? "dark" : "light")) continue;
    paintDiagram(element, isDark);
  }
}
