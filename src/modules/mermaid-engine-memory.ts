import type { MermaidEngine } from "./mermaid-core.js";
/* Obsidian loads its Mermaid script once per window and assigns the engine to the global only then. When this
   plugin is disabled and enabled again (an update, or the settings toggle), the global may already be gone and
   loadMermaid() will not assign it again. Keep every engine seen on the window, under a hidden key. */
const KEY = "__ibNativeMermaid";

export function isMermaidEngine(value: unknown): value is MermaidEngine {
  const candidate = value as Partial<Record<keyof MermaidEngine, unknown>> | null | undefined;
  return typeof candidate === "object" && candidate !== null && typeof candidate.render === "function" && typeof candidate.initialize === "function";
}

export function rememberEngine(host: object, value: unknown) {
  if (!isMermaidEngine(value)) return;
  Object.defineProperty(host, KEY, { value, configurable: true, enumerable: false, writable: true });
}

export function rememberedEngine(host: object): MermaidEngine | undefined {
  const value = (host as Record<string, unknown>)[KEY];
  return isMermaidEngine(value) ? value : undefined;
}

/** The engine to wrap after loadMermaid() settles: what it resolved with, unless that is the plugin's own stand-in
 *  (Obsidian up to 1.13 resolved with the global), else the engine found some other way. */
export function pickEngine(resolved: unknown, standIn: unknown, fallback: MermaidEngine | undefined): MermaidEngine | undefined {
  return resolved !== standIn && isMermaidEngine(resolved) ? resolved : fallback;
}
