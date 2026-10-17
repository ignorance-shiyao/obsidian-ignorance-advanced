import { Plugin } from "obsidian";
import { createAfterPaintQueue } from "./modules/after-paint-queue.js";
import { BlockHeightMemory } from "./modules/block-height-memory.js";
import { guardedCleanup } from "./modules/plugin-cleanup.js";
import type { TableSizeStyles } from "./modules/editor-tools.js";
import type { DiagramState, PluginState } from "./plugin-types.js";

import * as BlockTools from "./plugin/block-tools.js";
import * as DiagramLayout from "./plugin/diagram-layout.js";
import * as Lifecycle from "./plugin/lifecycle.js";
import * as MermaidLoader from "./plugin/mermaid-loader.js";
import * as StoredState from "./plugin/stored-state.js";
import * as TableSizes from "./plugin/table-sizes.js";

// The plugin class only holds state and hands each job to the module that does it (src/plugin/*):
// lifecycle (onload / onunload), mermaid-loader, diagram-layout, block-tools, table-sizes, stored-state.
// Other modules call these methods on the plugin, so the names stay here as one-line delegates.
class IgnoranceBlueMermaidPlugin extends Plugin {
  declare state: PluginState;
  declare measuredBounds: WeakMap<Element, any>;
  declare fileTools: Readonly<Record<string, any>>;
  declare diagramStates: WeakMap<Element, DiagramState>;
  declare diagramEnhancements: ReturnType<typeof createAfterPaintQueue>;
  declare heightMemory: BlockHeightMemory;
  declare tableStyles: InstanceType<typeof TableSizeStyles>;
  declare tableLayers: Set<any>;
  declare observer: MutationObserver;
  declare themeObserver: MutationObserver;
  declare exporters: Record<string, any>;
  declare bundledMermaid: any;
  declare blockSources: WeakMap<Element, any>;
  declare echartsSources: WeakMap<Element, any>;
  declare saveTimer: number;
  declare retightenQueue: Map<any, any>;
  declare retightenFrame: number;
  declare baseWidths: Map<any, any> | null;
  declare drawnSizes: WeakMap<Element, any>;
  declare pageStateReady: boolean;
  declare exportPreview?: any;
  declare tabOpeningInstalled: boolean;
  declare ensureMermaid: () => Promise<any>;
  declare applyGrayMode?: () => void;
  declare refreshReadingTime?: () => void;
  register(callback) {
    super.register(guardedCleanup(callback));
  }
  onload() { return Lifecycle.onload(this); }
  installLazyMermaid() { return MermaidLoader.installLazyMermaid(this); }
  redrawStaleDiagrams() { return MermaidLoader.redrawStaleDiagrams(this); }
  enhanceCodeBlocks(root: HTMLElement, context) { return BlockTools.enhanceCodeBlocks(this, root, context); }
  renderMarkdownPreviewBlock(source, element: HTMLElement, context) { return BlockTools.renderMarkdownPreviewBlock(this, source, element, context); }
  rememberSource(element: HTMLElement, context) { return BlockTools.rememberSource(this, element, context); }
  editLanguage(label: string, pre, context, current) { return BlockTools.editLanguage(this, label, pre, context, current); }
  writeFenceLanguage(pre, context, language) { return BlockTools.writeFenceLanguage(this, pre, context, language); }
  collapseSelectionAfterEdit() { return BlockTools.collapseSelectionAfterEdit(this); }
  anchorEditedBlock(target: HTMLElement) { return BlockTools.anchorEditedBlock(this, target); }
  buildBlockHeader(container: HTMLElement, options) { return BlockTools.buildBlockHeader(this, container, options); }
  createEditButton(container: HTMLElement) { return BlockTools.createEditButton(this, container); }
  editBlock(container: HTMLElement) { return BlockTools.editBlock(this, container); }
  storedSourceFor(element: HTMLElement) { return BlockTools.storedSourceFor(this, element); }
  createCopyButton(container: HTMLElement) { return BlockTools.createCopyButton(this, container); }
  sourceForBlock(element: HTMLElement) { return BlockTools.sourceForBlock(this, element); }
  sweepBlocks() { return BlockTools.sweepBlocks(this); }
  loadStoredState() { return StoredState.loadStoredState(this); }
  saveStoredState() { return StoredState.saveStoredState(this); }
  applyDensity() { return StoredState.applyDensity(this); }
  applyCodeLineNumbers() { return StoredState.applyCodeLineNumbers(this); }
  cycleDensity() { return StoredState.cycleDensity(this); }
  storedSizes(path: string, ordinal) { return TableSizes.storedSizes(this, path, ordinal); }
  storeSizes(path: string, ordinal, sizes) { return TableSizes.storeSizes(this, path, ordinal, sizes); }
  enhanceTables(root: HTMLElement, context) { return TableSizes.enhanceTables(this, root, context); }
  enhanceLiveTable(table) { return TableSizes.enhanceLiveTable(this, table); }
  attachTable(table, path: string, ordinal) { return TableSizes.attachTable(this, table, path, ordinal); }
  isDarkTheme() { return MermaidLoader.isDarkTheme(this); }
  repaintAll(force = false) { return MermaidLoader.repaintAll(this, force); }
  onunload() { return Lifecycle.onunload(this); }
  enhanceAll(root: HTMLElement) { return DiagramLayout.enhanceAll(this, root); }
  enhanceDiagrams(diagrams) { return DiagramLayout.enhanceDiagrams(this, diagrams); }
  disposeDiagram(container: HTMLElement) { return DiagramLayout.disposeDiagram(this, container); }
  enhanceDiagram(container: HTMLElement) { return DiagramLayout.enhanceDiagram(this, container); }
  maxCanvasHeight() { return DiagramLayout.maxCanvasHeight(this); }
  scheduleRetighten(container: HTMLElement, state, svg: SVGSVGElement) { return DiagramLayout.scheduleRetighten(this, container, state, svg); }
  flushRetighten() { return DiagramLayout.flushRetighten(this); }
  settleDiagramFits(root: HTMLElement, signal) { return DiagramLayout.settleDiagramFits(this, root, signal); }
  refitJobs(jobs) { return DiagramLayout.refitJobs(this, jobs); }
  fitDiagram(container: HTMLElement, state) { return DiagramLayout.fitDiagram(this, container, state); }
  applyFit(state, scale) { return DiagramLayout.applyFit(this, state, scale); }
  measureFit(container: HTMLElement, state) { return DiagramLayout.measureFit(this, container, state); }
  availableWidth(container: HTMLElement) { return DiagramLayout.availableWidth(this, container); }
  getDiagramSize(svg: SVGSVGElement) { return DiagramLayout.getDiagramSize(this, svg); }
  tightenViewBox(svg: SVGSVGElement) { return DiagramLayout.tightenViewBox(this, svg); }
  bleedTarget(container: HTMLElement) { return DiagramLayout.bleedTarget(this, container); }
  maxBleed(container: HTMLElement) { return DiagramLayout.maxBleed(this, container); }
  setBleed(container: HTMLElement, perSide) { return DiagramLayout.setBleed(this, container, perSide); }
  sizeCanvas(container: HTMLElement, state) { return DiagramLayout.sizeCanvas(this, container, state); }
}

export type { IgnoranceBlueMermaidPlugin };
module.exports = IgnoranceBlueMermaidPlugin;
