import { Plugin } from "obsidian";
import { createAfterPaintQueue } from "./modules/after-paint-queue.js";
import { BlockHeightMemory } from "./modules/block-height-memory.js";
import { guardedCleanup } from "./modules/plugin-cleanup.js";
import type { TableSizeStyles } from "./modules/editor-tools.js";
import type { BlockSource, DiagramState, PluginState, RetightenJob, TableLayer } from "./plugin-types.js";
import type { MermaidEngine, measureDrawnSize, measureRenderedContent } from "./modules/mermaid-core.js";
import type { ExportPreviewModal } from "./modules/export-preview.js";
import type * as Export from "./modules/export.js";
import type * as HtmlExport from "./modules/html-export.js";
import type * as FileTools from "./modules/file-tools.js";
import type * as Slides from "./modules/slides.js";

/** A module function's parameters after the leading plugin argument. */
type Rest<F> = F extends (plugin: never, ...args: infer A) => unknown ? A : never;

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
  declare measuredBounds: WeakMap<Element, ReturnType<typeof measureRenderedContent>>;
  declare fileTools: Readonly<{
    isMarkdownImportSource: typeof FileTools.isMarkdownImportSource;
    importVaultFileAsMarkdown: (...args: Rest<typeof FileTools.importVaultFileAsMarkdown>) => ReturnType<typeof FileTools.importVaultFileAsMarkdown>;
  }>;
  declare diagramStates: WeakMap<Element, DiagramState>;
  declare diagramEnhancements: ReturnType<typeof createAfterPaintQueue>;
  declare heightMemory: BlockHeightMemory;
  declare tableStyles: InstanceType<typeof TableSizeStyles>;
  declare tableLayers: Set<TableLayer>;
  declare observer: MutationObserver;
  declare themeObserver: MutationObserver;
  declare exporters: {
    pdf: typeof Export.exportPdf;
    word: typeof Export.exportWord;
    images: typeof Export.exportImages;
    richCopy: typeof Export.prepareRichCopyMarkup;
    copyFormatted: typeof Export.copyFormattedNote;
    html: typeof HtmlExport.prepareHtmlDocument;
    exportHtml: typeof HtmlExport.exportHtml;
    pptx: typeof Slides.exportNotePptx;
  };
  declare bundledMermaid: MermaidEngine;
  declare blockSources: WeakMap<Element, BlockSource>;
  declare echartsSources: WeakMap<Element, string>;
  declare saveTimer: number;
  declare retightenQueue: Map<HTMLElement, RetightenJob>;
  declare retightenFrame: number;
  declare baseWidths: Map<HTMLElement, number> | null;
  declare drawnSizes: WeakMap<SVGSVGElement, NonNullable<ReturnType<typeof measureDrawnSize>>>;
  declare pageStateReady: boolean;
  declare exportPreview?: ExportPreviewModal;
  declare tabOpeningInstalled: boolean;
  declare ensureMermaid: () => Promise<MermaidEngine>;
  declare applyGrayMode?: () => void;
  declare refreshReadingTime?: () => void;
  register(callback: () => unknown) {
    super.register(guardedCleanup(callback));
  }
  onload() { return Lifecycle.onload(this); }
  installLazyMermaid() { return MermaidLoader.installLazyMermaid(this); }
  redrawStaleDiagrams() { return MermaidLoader.redrawStaleDiagrams(this); }
  enhanceCodeBlocks(...args: Rest<typeof BlockTools.enhanceCodeBlocks>) { return BlockTools.enhanceCodeBlocks(this, ...args); }
  renderMarkdownPreviewBlock(...args: Rest<typeof BlockTools.renderMarkdownPreviewBlock>) { return BlockTools.renderMarkdownPreviewBlock(this, ...args); }
  rememberSource(...args: Rest<typeof BlockTools.rememberSource>) { return BlockTools.rememberSource(this, ...args); }
  editLanguage(...args: Rest<typeof BlockTools.editLanguage>) { return BlockTools.editLanguage(this, ...args); }
  writeFenceLanguage(...args: Rest<typeof BlockTools.writeFenceLanguage>) { return BlockTools.writeFenceLanguage(this, ...args); }
  collapseSelectionAfterEdit() { return BlockTools.collapseSelectionAfterEdit(this); }
  anchorEditedBlock(...args: Rest<typeof BlockTools.anchorEditedBlock>) { return BlockTools.anchorEditedBlock(this, ...args); }
  buildBlockHeader(...args: Rest<typeof BlockTools.buildBlockHeader>) { return BlockTools.buildBlockHeader(this, ...args); }
  createEditButton(...args: Rest<typeof BlockTools.createEditButton>) { return BlockTools.createEditButton(this, ...args); }
  editBlock(...args: Rest<typeof BlockTools.editBlock>) { return BlockTools.editBlock(this, ...args); }
  storedSourceFor(...args: Rest<typeof BlockTools.storedSourceFor>) { return BlockTools.storedSourceFor(this, ...args); }
  createCopyButton(...args: Rest<typeof BlockTools.createCopyButton>) { return BlockTools.createCopyButton(this, ...args); }
  sourceForBlock(...args: Rest<typeof BlockTools.sourceForBlock>) { return BlockTools.sourceForBlock(this, ...args); }
  sweepBlocks() { return BlockTools.sweepBlocks(this); }
  loadStoredState() { return StoredState.loadStoredState(this); }
  saveStoredState() { return StoredState.saveStoredState(this); }
  onExternalSettingsChange() { return StoredState.mergeExternalState(this); }
  applyDensity() { return StoredState.applyDensity(this); }
  applyCodeLineNumbers() { return StoredState.applyCodeLineNumbers(this); }
  cycleDensity() { return StoredState.cycleDensity(this); }
  storedSizes(...args: Rest<typeof TableSizes.storedSizes>) { return TableSizes.storedSizes(this, ...args); }
  storeSizes(...args: Rest<typeof TableSizes.storeSizes>) { return TableSizes.storeSizes(this, ...args); }
  enhanceTables(...args: Rest<typeof TableSizes.enhanceTables>) { return TableSizes.enhanceTables(this, ...args); }
  enhanceLiveTable(...args: Rest<typeof TableSizes.enhanceLiveTable>) { return TableSizes.enhanceLiveTable(this, ...args); }
  attachTable(...args: Rest<typeof TableSizes.attachTable>) { return TableSizes.attachTable(this, ...args); }
  isDarkTheme() { return MermaidLoader.isDarkTheme(this); }
  repaintAll(...args: Rest<typeof MermaidLoader.repaintAll>) { return MermaidLoader.repaintAll(this, ...args); }
  onunload() { return Lifecycle.onunload(this); }
  enhanceAll(...args: Rest<typeof DiagramLayout.enhanceAll>) { return DiagramLayout.enhanceAll(this, ...args); }
  enhanceDiagrams(...args: Rest<typeof DiagramLayout.enhanceDiagrams>) { return DiagramLayout.enhanceDiagrams(this, ...args); }
  disposeDiagram(...args: Rest<typeof DiagramLayout.disposeDiagram>) { return DiagramLayout.disposeDiagram(this, ...args); }
  enhanceDiagram(...args: Rest<typeof DiagramLayout.enhanceDiagram>) { return DiagramLayout.enhanceDiagram(this, ...args); }
  maxCanvasHeight() { return DiagramLayout.maxCanvasHeight(this); }
  scheduleRetighten(...args: Rest<typeof DiagramLayout.scheduleRetighten>) { return DiagramLayout.scheduleRetighten(this, ...args); }
  flushRetighten() { return DiagramLayout.flushRetighten(this); }
  settleDiagramFits(...args: Rest<typeof DiagramLayout.settleDiagramFits>) { return DiagramLayout.settleDiagramFits(this, ...args); }
  refitJobs(...args: Rest<typeof DiagramLayout.refitJobs>) { return DiagramLayout.refitJobs(this, ...args); }
  fitDiagram(...args: Rest<typeof DiagramLayout.fitDiagram>) { return DiagramLayout.fitDiagram(this, ...args); }
  applyFit(...args: Rest<typeof DiagramLayout.applyFit>) { return DiagramLayout.applyFit(this, ...args); }
  measureFit(...args: Rest<typeof DiagramLayout.measureFit>) { return DiagramLayout.measureFit(this, ...args); }
  availableWidth(...args: Rest<typeof DiagramLayout.availableWidth>) { return DiagramLayout.availableWidth(this, ...args); }
  getDiagramSize(...args: Rest<typeof DiagramLayout.getDiagramSize>) { return DiagramLayout.getDiagramSize(this, ...args); }
  tightenViewBox(...args: Rest<typeof DiagramLayout.tightenViewBox>) { return DiagramLayout.tightenViewBox(this, ...args); }
  bleedTarget(...args: Rest<typeof DiagramLayout.bleedTarget>) { return DiagramLayout.bleedTarget(this, ...args); }
  maxBleed(...args: Rest<typeof DiagramLayout.maxBleed>) { return DiagramLayout.maxBleed(this, ...args); }
  setBleed(...args: Rest<typeof DiagramLayout.setBleed>) { return DiagramLayout.setBleed(this, ...args); }
  sizeCanvas(...args: Rest<typeof DiagramLayout.sizeCanvas>) { return DiagramLayout.sizeCanvas(this, ...args); }
}

export type { IgnoranceBlueMermaidPlugin };
export default IgnoranceBlueMermaidPlugin;
