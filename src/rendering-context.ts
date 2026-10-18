import type { Plugin } from "obsidian";
import type { BlockSource, DiagramState, PluginState } from "./plugin-state.js";
export type { PageState, PluginState } from "./plugin-state.js";

/** Rendering depends on these capabilities, never on the plugin entry point or exporters. */
export interface RenderingContext extends Plugin {
  state: PluginState;
  blockSources: WeakMap<Element, BlockSource>;
  diagramStates: WeakMap<Element, DiagramState>;
  storedSourceFor(element: HTMLElement): BlockSource | null;
  disposeDiagram(container: HTMLElement): void;
  enhanceDiagrams(containers: HTMLElement[]): void;
  scheduleRetighten(container: HTMLElement, state: DiagramState, svg: SVGSVGElement): void;
  settleDiagramFits(root: HTMLElement, signal?: AbortSignal): Promise<void>;
}
