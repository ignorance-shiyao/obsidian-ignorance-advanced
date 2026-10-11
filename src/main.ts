import { tableAlignmentControl, syncPreviewTableAlignment } from "./modules/table-alignment.js";
import { setIcon, UI_ICONS } from "./modules/ui-icons.js";
import { installChartPreload } from "./modules/chart-preload.js";
import { installPreviewOverscan } from "./modules/preview-overscan.js";
import { mountChartAlignment, chartAlignment } from "./modules/chart-alignment.js";
import { markContext, clearContextMarkers } from "./modules/context-markers.js";
import { BlockHeightMemory } from "./modules/block-height-memory.js";
import { anchorBlockTop } from "./modules/quiet-edit.js";
import { openLanguagePicker, withFenceLanguage } from "./modules/language-picker.js";
import { createLanguageIcon, setLanguageIconHost } from "./modules/language-icons.js";
import { installFileIcons } from "./modules/file-icons.js";
import { diagramFit, HALF_A4_HEIGHT, DIAGRAM_HEADER_HEIGHT } from "./modules/diagram-fit.js";
import { echartsSourceHighlighter } from "./modules/echarts-source.js";
import { installCalloutMotion } from "./modules/callout-motion";
import { showCopyFeedback } from "./modules/copy-feedback";
import { normalizePresentationSkin } from "./modules/skin-choice.js";
import * as FileTools from "./modules/file-tools.js";
import * as Appearance from "./modules/appearance.js";
import * as PageControls from "./modules/page-controls.js";
import * as ReadingPagination from "./modules/reading-pagination.js";
import * as ExportTools from "./modules/export.js";
import * as HtmlExportTools from "./modules/html-export.js";
import { installPresentationMode, exportNotePptx, openPresentation } from "./modules/slides.js";
import { installImageAlignment } from "./modules/image-align.js";
import { installReadingPosition } from "./modules/reading-position.js";
import { setChunkHost } from "./modules/chunks.js";
import { installHeaderPath } from "./modules/header-path.js";
import { installExternalFiles } from "./modules/external-files.js";
import { installWebClip } from "./modules/web-clip.js";
import { installMoreMenuFilter } from "./modules/more-menu.js";
import { colorSwatchExtension, colorSwatchPostProcessor } from "./modules/color-swatch.js";
import * as TocModule from "./modules/toc.js";
import { TABLE_COMMANDS, applyTableEdit, canEditTable, tableEditorExtension } from "./modules/table-editor.js";
import { wrapSelectionExtension } from "./modules/wrap-selection.js";
import { smartPunctuationExtension } from "./modules/smart-punctuation.js";
import { SNIPPET_TEMPLATES, buildSnippetInsertion } from "./modules/snippets.js";
import { containerEditorExtension } from "./modules/container-editor.js";
import { inlineSyntaxEditorExtension } from "./modules/inline-syntax-editor.js";
import { installTabOpening, IgnoranceSettingTab } from "./modules/settings.js";
import * as MermaidCore from "./modules/mermaid-core.js";
import { createMermaidRenderQueue } from "./modules/mermaid-render-queue.js";
import { renderContainerBlocks } from "./modules/containers.js";
import { renderInlineSyntax } from "./modules/inline-syntax.js";
import { renderEChartsBlock } from "./modules/echarts-renderer.js";
import { fencedCodeContent, parseHighlightedCodeLines, wrapCodeLines } from "./modules/code-lines.js";
import { lineAt } from "./modules/line-index.js";
import { measureDiagramFont, readableDiagramScale } from "./modules/diagram-readable-scale.js";
import { guardedCleanup, restoreGlobalProperty } from "./modules/plugin-cleanup.js";
import { createAfterPaintQueue } from "./modules/after-paint-queue.js";

// Mermaid's built-in edge animations (see styles.css for the shared copies).
const MERMAID_KEYFRAMES = /@keyframes\s+(?:edge-animation-frame|dash)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
const {
  TOKEN_CLASSES,
  TOKEN_PATTERNS,
  tokenRuns,
  buildMermaidDecorations,
  STRUCTURAL_KINDS,
  SERIES_KINDS,
  SERIES_MARKS,
  SERIES_SWATCHES,
  THEMED_KINDS,
  C4_DEFAULTS,
  PERSON_GLYPH,
  SVG_NS_C4,
  cssColorToRgb,
  authorPersonColor,
  stashStyle,
  adoptC4Defaults,
  CLUSTER_GROUPS,
  TAG_ATTRS,
  SVG_NS,
  diagramKind,
  seriesIndex,
  slot,
  applyPaint,
  clearPaint,
  paintDiagram,
  parseTranslate,
  spreadArchitectureServices,
  shiftEdgeEnds,
  whenMeasurable,
  fitVennTitle,
  separateVennLabels,
  arrangeJourneyFaces,
  markGanttSections,
  buildPieTable,
  FLOW_ICONS,
  REQ_ICONS,
  requirementIcon,
  drawRequirementCards,
  decorateUsecase,
  FLOW_KEYWORDS,
  CLUSTER_KEYWORDS,
  flowIcon,
  decorateFlowchart,
  LANE_KEYWORDS,
  decorateSwimlanes,
  PARTICIPANT_KEYWORDS,
  FRAME_TYPES,
  decorateSequence,
  tagGroups,
  tagTreemapLeaves,
  tagSeries,
  markLabelsOver,
  CLASS_ICONS,
  drawClassNotes,
  drawClassCards,
  themeTokens,
  TEXT_TAGS,
  isTextElement,
  hexToRgb,
  parseColor,
  rgbToHsl,
  hslToCss,
  relativeLuminance,
  contrastRatio,
  toneMapForDark,
  NON_RENDERED,
  MEASURABLE,
  measureRenderedContent,
  measureDrawnSize,
  inkClientRect,
  measureDrawnSizeFromViewBox,
  toUserSpace,
  DIAGRAM_LABELS,
  diagramLabel,
  LANGUAGE_LABELS,
  languageOf,
  languageLabel,
  STRINGS,
  interfaceLanguage,
  t,
  MERMAID_FILE,
  MERMAID_VERSION,
  EXTERNAL_DIAGRAMS,
  evalEsbuildBundle,
  COLUMN_WIDTH,
  COMFORTABLE_HEIGHT,
  MIN_READABLE,
  FLOWCHART_HEADER,
  svgSize,
  readability,
  ELK_FILE,
  ELK_ALGORITHMS,
  elkWrapRequested,
  registerElkLayouts,
  TARGET_ASPECT,
  withLayoutDirective,
  installBalancedLayout,
  USECASE_HEADER,
  USECASE_EDGE,
  usecasePositions,
  segmentsCross,
  countCrossings,
  reorderUsecaseSource,
  FLOW_SHAPE_RE,
  FLOW_SHAPES,
  SWIMLANE_HEADER,
  installFlowchartShapes,
  installUsecaseOrdering,
  registerExternalDiagrams,
  MERMAID_CONFIG,
  USE_CLASSIC_ENGINE,
  CLASSIC_FAMILIES,
  loadObsidianMermaid,
  loadBundledMermaid
} = MermaidCore;

import * as EditorTools from "./modules/editor-tools.js";

const {
  DENSITIES,
  MIN_COLUMN_WIDTH,
  isTableDelimiter,
  tableOrdinal,
  headerCells,
  tableRows,
  MIN_ROW_HEIGHT,
  TableSizeStyles,
  tableKey,
  rowSelectors,
  TableResizeLayer,
  mermaidHighlighter,
  FENCE_OPEN,
  fencedSource,
  CodeCopyWidget,
  buildCopyDecorations,
  codeCopyButtons,
  installQuietTaskToggle,
  installCodeLanguagePicker,
  writingModeRefresh,
  buildWritingFocusDecorations,
  writingModesExtension,
  setWritingMode,
  toggleWritingMode,
  writingModeDefaults
} = EditorTools;

const {
  HTML_READONLY_VIEW,
  fileToolsDefaults,
  isPastedImageFile,
  pastedImageFiles,
  imageTransferRange,
  imageTransferSequence,
  handleImageTransfer,
  replacePendingImageMarker,
  encodePastedImage,
  nextPastedImageSequence,
  trashPastedImageFiles,
  savePastedImages,
  addFileToolsMenu,
  isMarkdownImportSource,
  MarkdownImportModal,
  importVaultFileAsMarkdown,
  runFileTool,
  fullVaultPath,
  openWithNamedApp,
  escapeHtmlAttribute,
  htmlReaderDocument,
  HtmlReadOnlyView,
  findCwebp,
  convertImageToWebp,
  pathBasename,
  execFileAsync,
  collectFiles,
  decodeHtmlEntities,
  mediaKey,
  rewriteImportedMedia,
  safeAssetStem,
  importDocxAsMarkdown
} = FileTools;

const {
  ACCENT_PRESETS,
  CUSTOM_ACCENT,
  writeCustomPalette,
  appearanceDefaults,
  tabDefaults,
  currentAccent,
  applyAppearancePreferences,
  clearAppearancePreferences,
  applyAccent,
  addDropdownSetting,
  themeMode,
  setThemeMode,
  installAppearanceControls
} = Appearance;

const {
  PAPERS,
  WIDTH_PRESETS,
  PAGE_GAP,
  applyPageSettings,
  refreshPageNumbers,
  installPageControls,
  setPageRefreshHandler
} = PageControls;

const {
  books,
  stripFrontmatter,
  breakPoints,
  paginateStrip,
  rendering,
  renderBook,
  renderBookOnce,
  pageBlockRanges,
  pageBlockSignatures,
  reusablePagePrefix,
  makePage,
  settleRenderRegion,
  composePages,
  hashText,
  settleRender,
  refreshBooks
} = ReadingPagination;

const {
  openExportMenu,
  runExport,
  pageVarsAtFullScale,
  withExportStage,
  exportPdf,
  nextFrame,
  captureElement,
  exportImages,
  findPandoc,
  toPngFile,
  prepareMarkdownForPandoc,
  exportWord,
  prepareRichCopyMarkup,
  copyFormattedNote
} = ExportTools;

const { prepareHtmlDocument, exportHtml } = HtmlExportTools;

const {
  tocHeadings,
  buildTocList,
  jumpToHeading,
  renderTocBlocks,
  TocWidget,
  tocExtension
} = TocModule;
const { Notice, Plugin, MarkdownView, MarkdownRenderer, Component, Platform } = require("obsidian");

// Raw viewBox plus the label text identify a diagram across renders (ids and styles vary).
function diagramHeightKey(svg, viewBox: string) {
  const text = [...svg.querySelectorAll("text, .nodeLabel")].map(node => node.textContent).join("").slice(0, 160);
  return `m\n${viewBox}\n${text}`;
}

function insertSnippet(editor, snippet) {
  const from = editor.getCursor("from");
  const to = editor.getCursor("to");
  const start = editor.getRange({ line: 0, ch: 0 }, from).length;
  const end = editor.getRange({ line: 0, ch: 0 }, to).length;
  const insertion = buildSnippetInsertion(editor.getValue(), start, end, snippet.body);
  editor.replaceRange(insertion.text, editor.offsetToPos(insertion.from), editor.offsetToPos(insertion.to));
  const selectionFrom = insertion.from + insertion.selectionFrom;
  const selectionTo = insertion.from + insertion.selectionTo;
  editor.setSelection(editor.offsetToPos(selectionFrom), editor.offsetToPos(selectionTo));
}

class IgnoranceBlueMermaidPlugin extends Plugin {
  register(callback) {
    super.register(guardedCleanup(callback));
  }
  async onload() {
    setChunkHost(this);
    this.measuredBounds = new WeakMap();
    this.fileTools = Object.freeze({
      isMarkdownImportSource,
      importVaultFileAsMarkdown: (file, noteName) => importVaultFileAsMarkdown(this, file, noteName)
    });
    this.diagramStates = new WeakMap();
    this.diagramEnhancements = createAfterPaintQueue(container => this.enhanceDiagram(container));
    this.register(() => this.diagramEnhancements.clear());
    setPageRefreshHandler(refreshBooks);
    this.registerEditorExtension(mermaidHighlighter);
    // Typora-style [toc]: a table of contents in reading view, exports and the editor.
    this.registerEditorExtension(tocExtension(this));
    // Render Markdown ::: containers while the cursor is outside their source.
    this.registerEditorExtension(containerEditorExtension(this));
    this.registerEditorExtension(inlineSyntaxEditorExtension(this));
    // Paged view in the editor: push blocks that would cross a page bottom.
    // Format Markdown tables and provide cell/row keyboard navigation.
    this.registerEditorExtension(tableEditorExtension);
    // Typora-style marker keys wrap the current non-empty selection.
    this.registerEditorExtension(wrapSelectionExtension);
    this.registerEditorExtension(colorSwatchExtension);
    this.registerEditorExtension(smartPunctuationExtension(this));
    this.registerMarkdownPostProcessor((element, context) => renderTocBlocks(this, element, context.sourcePath));
    this.registerMarkdownPostProcessor((element, context) => renderContainerBlocks(this, element, context));
    this.registerMarkdownPostProcessor(element => renderInlineSyntax(this, element));
    this.registerMarkdownPostProcessor(element => colorSwatchPostProcessor(element));
    // Warming every diagram in the open note loads the 1 MB ECharts and 5 MB Mermaid engines in the
    // background; on a phone that competes with startup, so diagrams are drawn when they are reached.
    if (!Platform.isMobile) installChartPreload(this);
    installPreviewOverscan(this);
    this.registerEditorExtension(echartsSourceHighlighter);
    this.registerMarkdownCodeBlockProcessor("echarts", (source, element, context) => renderEChartsBlock(this, source, element, context));
    for (const language of ["markdown", "md"]) {
      this.registerMarkdownCodeBlockProcessor(language, (source, element, context) =>
        this.renderMarkdownPreviewBlock(source, element, context));
    }
    this.registerEditorExtension(codeCopyButtons);
    installQuietTaskToggle(this);
    installCodeLanguagePicker(this);
    this.registerEditorExtension(writingModesExtension(this));

    // Claim the Mermaid global before anything renders, but load the 5 MB
    // engine only when a diagram actually needs it.
    this.installLazyMermaid();
    setLanguageIconHost(this);
    installFileIcons(this);
    this.heightMemory = new BlockHeightMemory(this.app, "ignorance-advanced-block-heights");
    this.register(() => this.heightMemory.dispose());

    await this.loadStoredState();
    installPresentationMode(this);
    this.registerView(HTML_READONLY_VIEW, leaf => new HtmlReadOnlyView(leaf));
    this.registerExtensions(["html", "htm"], HTML_READONLY_VIEW);
    this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => addFileToolsMenu(this, menu, file)));
    installCalloutMotion(this);
    installImageAlignment(this);
    installReadingPosition(this);
    installHeaderPath(this);
    installExternalFiles(this);
    installWebClip(this);
    installMoreMenuFilter(this);
    // Mobile has no title-row toolbar (phones) or no Electron exports: offer
    // slides and the exports that work there from the note's "⋯" menu.
    if (Platform.isMobile) {
      this.registerEvent(this.app.workspace.on("file-menu", (menu, file, source) => {
        if (source !== "more-options" || file?.extension !== "md") return;
        menu.addItem(item => item.setTitle("演示").setIcon("lucide-presentation").setSection("ibp-export").onClick(() => { void openPresentation(this, file); }));
        ExportTools.addPortableExportItems(this, menu, file);
      }));
    }
    this.registerEvent(this.app.workspace.on("editor-paste", (event, editor, info) => handleImageTransfer(this, event, editor, info, "paste")));
    this.registerEvent(this.app.workspace.on("editor-drop", (event, editor, info) => handleImageTransfer(this, event, editor, info, "drop")));
    this.addSettingTab(new IgnoranceSettingTab(this.app, this));
    this.register(() => clearAppearancePreferences());
    this.register(() => document.body.classList.remove("ib-show-code-line-numbers"));
    this.tableStyles = new TableSizeStyles();
    this.tableLayers = new Set();
    this.register(() => {
      this.tableStyles.destroy();
      for (const layer of this.tableLayers) layer.destroy();
      document.querySelectorAll("table.ibt-enhanced").forEach(table => {
        table.classList.remove("ibt-enhanced");
        delete table.dataset.ibtKey;
      });
    });

    this.registerMarkdownPostProcessor((element, context) => {
      if (element.querySelector("pre > code")) this.rememberSource(element, context);
      this.enhanceCodeBlocks(element, context);
      this.enhanceTables(element, context);
      window.requestAnimationFrame(() => { this.enhanceCodeBlocks(element, context); this.enhanceAll(element); });
      window.setTimeout(() => { this.enhanceCodeBlocks(element, context); this.enhanceAll(element); }, 250);
    });

    this.observer = new MutationObserver(mutations => {
      // Gather first, then enhance once: a render adds many nodes per batch.
      const diagrams = new Set();
      const removedDiagrams = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (!(node instanceof Element) || node.matches(".ibp-book") || node.closest(".ibp-book")) continue;
          if (node.matches(".mermaid.ibm-mermaid-enhanced")) removedDiagrams.add(node);
          node.querySelectorAll(".mermaid.ibm-mermaid-enhanced").forEach(element => removedDiagrams.add(element));
        }
        for (const node of mutation.addedNodes) {
          // An <svg> is an SVGElement, not an HTMLElement — testing for the
          // latter dropped every diagram whose container was inserted empty and
          // filled in afterwards.
          if (!(node instanceof Element)) continue;
          // Paged books and code lines are copies/fragments with nothing to enhance.
          // Paged books hold copies that the theme styles too.
          if (!node.classList.contains("ib-code-line")) markContext(node);
          if (node.closest(".ibp-book") || node.classList.contains("ib-code-line")) continue;
          if (node.matches(".mermaid")) diagrams.add(node);
          node.querySelectorAll(".mermaid").forEach(element => diagrams.add(element));
          const tables = node.matches(".cm-table-widget table") ? [node] : [...node.querySelectorAll(".cm-table-widget table")];
          for (const table of tables) this.enhanceLiveTable(table);
          // …and the container is then an ancestor, not this node or below it.
          const owner = node.parentElement?.closest?.(".mermaid");
          if (owner) diagrams.add(owner);
        }
      }
      for (const diagram of removedDiagrams) { if (!diagram.isConnected) this.disposeDiagram(diagram); }
      if (diagrams.size) this.enhanceDiagrams([...diagrams]);
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.register(() => this.observer.disconnect());
    markContext(document.body);
    this.register(() => clearContextMarkers());
    // While the "title" property is being edited, Obsidian's value suggestions would cover the title field.
    const syncTitleFocus = () => document.body.classList.toggle("ib-title-property-focus",
      Boolean(document.activeElement?.closest('.metadata-property[data-property-key="title" i]')));
    this.registerDomEvent(document, "focusin", syncTitleFocus);
    this.registerDomEvent(document, "focusout", () => window.setTimeout(syncTitleFocus, 0));
    this.register(() => document.body.classList.remove("ib-title-property-focus"));

    // A sweep on layout changes catches any diagram the observer missed.
    // Reading view renders a moment after the mode switch or the save, so look again a few times.
    const syncTablePositions = (file?) => [150, 700, 1800].forEach(delay => window.setTimeout(() => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        if (file && leaf.view.file?.path !== file.path) continue;
        void syncPreviewTableAlignment(this, leaf.view).catch(() => {});
      }
    }, delay));
    this.registerEvent(this.app.workspace.on("layout-change", () => { markContext(document.body); this.sweepBlocks(); syncTablePositions(); }));
    this.registerEvent(this.app.vault.on("modify", file => syncTablePositions(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
      this.sweepBlocks();
      refreshBooks(this, false);
    }));


    // Page toolbar above every note: width, zoom, paper pages, page numbers.
    // Phones: no page toolbar or paging (the screen is the page).
    if (!Platform.isPhone) this.app.workspace.onLayoutReady(() => installPageControls(this, openExportMenu));
    // Exports still need paper and margin settings there.
    else this.app.workspace.onLayoutReady(() => PageControls.initPageState(this));
    this.exporters = { pdf: exportPdf, word: exportWord, images: exportImages, richCopy: prepareRichCopyMarkup, copyFormatted: copyFormattedNote, html: prepareHtmlDocument, exportHtml, pptx: exportNotePptx };

    // Default new-tab behavior is applied at the Workspace API boundary.
    this.app.workspace.onLayoutReady(() => installTabOpening(this));

    // Desktop profile controls and mobile ribbon / note-menu controls share
    // the same theme preferences and switching behavior.
    this.app.workspace.onLayoutReady(() => installAppearanceControls(this));

    // Obsidian toggles theme-dark on <body>; repaint rather than re-render.
    this.themeObserver = new MutationObserver(() => {
      applyAppearancePreferences(this);
      this.repaintAll();
    });
    this.registerDomEvent(window, "ib-theme-change", () => this.repaintAll(true));
    this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this.register(() => this.themeObserver.disconnect());

    this.collapseSelectionAfterEdit();

    this.addCommand({
      id: "cycle-table-density",
      name: t("densityCommand"),
      callback: () => this.cycleDensity()
    });

    this.addCommand({
      id: "reset-table-widths",
      name: t("resetWidthsCommand"),
      callback: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const path = view?.file?.path;
        if (!path) return;
        const count = Object.keys(this.state.tables[path] || {}).length;
        delete this.state.tables[path];
        this.saveStoredState();
        // Clear in place: attached tables hold these same arrays, and a later
        // drag would otherwise write the old sizes straight back.
        for (let ordinal = 0; ordinal < Math.max(count, 64); ordinal += 1) {
          const entry = this.tableStyles.sizes.get(tableKey(path, ordinal));
          if (entry) { entry.sizes.cols.length = 0; entry.sizes.rows.length = 0; }
        }
        this.tableStyles.render();
        for (const layer of this.tableLayers) if (layer.built) layer.build();
        new Notice(t("widthsReset"));
      }
    });

    for (const command of TABLE_COMMANDS) {
      this.addCommand({
        id: `table-${command.action}`,
        name: command.name,
        editorCheckCallback: (checking, editor) => {
          const view = editor?.cm;
          if (!view || !canEditTable(view)) return false;
          return checking || applyTableEdit(view, command.action);
        }
      });
    }

    for (const snippet of SNIPPET_TEMPLATES) {
      this.addCommand({
        id: "insert-" + snippet.id,
        name: snippet.name,
        editorCheckCallback: (checking, editor) => {
          if (!editor) return false;
          if (checking) return true;
          insertSnippet(editor, snippet);
          return true;
        }
      });
    }

    this.addCommand({
      id: "toggle-typewriter-scroll",
      name: "切换打字机滚动",
      callback: () => toggleWritingMode(this, "typewriterScroll")
    });

    this.addCommand({
      id: "toggle-writing-focus",
      name: "切换专注模式",
      callback: () => toggleWritingMode(this, "focusMode")
    });

    if (!Platform.isMobile) {
      this.addCommand({
        id: "import-docx-markdown",
        name: "导入当前文件为 Markdown",
        callback: () => {
          const file = this.app.workspace.getActiveFile();
          if (!isMarkdownImportSource(file)) {
            new Notice("请先打开或选中支持的本地文件（DOCX、PDF、XLSX、PPTX、CSV、TSV、JSON、HTML 或 Notion ZIP）");
            return;
          }
          new MarkdownImportModal(this, file).open();
        }
      });
    }

    this.addCommand({
      id: "reset-active-mermaid-view",
      name: t("resetCommand"),
      callback: () => {
        const activeLeaf = this.app.workspace.activeLeaf;
        const container = activeLeaf?.view?.containerEl;
        if (!container) return;
        container.querySelectorAll(".mermaid.ibm-mermaid-enhanced").forEach(element => {
          const state = this.diagramStates.get(element);
          if (state) this.fitDiagram(element, state);
        });
      }
    });
  }



  /* Obsidian only calls mermaid.initialize() and mermaid.render(). Stand in
     for the global right away with a light router, and read and evaluate the
     bundled Mermaid (the slowest part of startup, especially on mobile) the
     first time a diagram is drawn. Desktop warms it up once the app is idle. */
  installLazyMermaid() {
    const previous = {
      mermaid: globalThis.mermaid,
      descriptor: Object.getOwnPropertyDescriptor(globalThis, "mermaid")
    };
    const configs = [];
    const overwrites = [];
    let engine = null;
    let loading = null;
    const ensure = () => loading ||= loadBundledMermaid(this, { publish: false })
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
        this.bundledMermaid = engine = mermaid;
        console.info(`Ignorance: Mermaid ${MERMAID_VERSION} loaded`);
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
    Object.defineProperty(globalThis, "mermaid", {
      configurable: true,
      enumerable: true,
      get: () => engine || lazy,
      set: value => { overwrites.push(value); }
    });
    this.ensureMermaid = ensure;
    this.register(() => {
      const native = overwrites[overwrites.length - 1] || previous.mermaid;
      const descriptor = previous.descriptor || (native ? { value: native, writable: true, configurable: true, enumerable: true } : undefined);
      guardedCleanup(() => restoreGlobalProperty(globalThis, "mermaid", descriptor), "恢复 Mermaid")();
      // __esbuild_esm_mermaid_nm belongs to Obsidian's lazy loader. Our bundle
      // evaluates it locally, so unloading must not delete or clear the
      // native loader that appeared after plugin startup.
    });
    if (!Platform.isMobile) {
      this.app.workspace.onLayoutReady(() => {
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
  redrawStaleDiagrams() {
    const stale = ".mermaid svg:not([data-ibm-engine])";
    this.app.workspace.iterateAllLeaves(leaf => {
      if (!(leaf.view instanceof MarkdownView)) return;
      if (!leaf.view.containerEl.querySelector(stale)) return;
      leaf.rebuildView?.();
    });
  }

  enhanceCodeBlocks(root, context) {
    for (const code of root.querySelectorAll("pre > code")) {
      const pre = code.parentElement;
      // Front matter is shown as the Properties box; its raw <pre> stays hidden.
      if (code.closest(".mermaid") || pre.matches(".frontmatter")) continue;
      const section = context?.getSectionInfo?.(pre);
      const fenceLine = section?.text != null ? lineAt(section.text, section.lineStart) : undefined;
      const hasFenceLine = /^\s*(?:`{3,}|~{3,})/.test(fenceLine || "");
      const storedHighlights = (pre.dataset.ibCodeHighlightLines || "").split(",").map(Number).filter(Boolean);
      const highlighted = hasFenceLine ? parseHighlightedCodeLines(fenceLine) : storedHighlights;
      pre.dataset.ibCodeHighlightLines = highlighted.join(",");
      try {
        wrapCodeLines(code, highlighted, hasFenceLine ? fencedCodeContent(section.text, section.lineStart) : undefined);
      } catch (error) {
        console.warn("Ignorance Advanced: code lines could not be wrapped —", error);
      }
      if (pre.classList.contains("ibc-enhanced")) continue;
      pre.classList.add("ibc-enhanced");

      const language = languageOf(code);
      this.rememberSource(pre, context);
      const { header, actions } = this.buildBlockHeader(pre, {
        label: languageLabel(language),
        language,
        withZoom: false,
        withEdit: false,
        onRename: label => this.editLanguage(label, pre, context, language)
      });
      mountChartAlignment(this, pre, actions);
      const wrap = document.createElement("button");
      wrap.type = "button";
      wrap.className = "ibm-code-wrap";
      setIcon(wrap, UI_ICONS.wrap);
      wrap.title = "代码换行";
      wrap.setAttribute("aria-label", "代码换行");
      wrap.setAttribute("aria-pressed", "false");
      wrap.addEventListener("click", () => {
        const enabled = pre.classList.toggle("ib-code-soft-wrap");
        wrap.setAttribute("aria-pressed", String(enabled));
      });
      actions.prepend(wrap);
      pre.insertBefore(header, pre.firstChild);
    }
  }

  async renderMarkdownPreviewBlock(source, element, context) {
    this.rememberSource(element, context);
    const component = new Component();
    component.load();
    context.addChild(component);

    element.classList.add("ibm-markdown-preview-block");
    const { header } = this.buildBlockHeader(element, {
      label: "Markdown",
      withZoom: false,
      withEdit: true
    });
    const preview = document.createElement("div");
    preview.className = "ibm-markdown-preview markdown-rendered";
    element.replaceChildren(header, preview);

    try {
      await MarkdownRenderer.render(this.app, source, preview, context.sourcePath || "", component);
    } catch (error) {
      console.error("Ignorance Advanced: Markdown code block preview failed —", error);
      const code = preview.createEl("pre").createEl("code", { cls: "language-markdown" });
      code.textContent = source;
    }
  }

  rememberSource(element, context) {
    const info = context?.getSectionInfo?.(element);
    if (!info || !context?.sourcePath) return;
    if (!this.blockSources) this.blockSources = new WeakMap();
    const fence = info.text.split("\n")[info.lineStart] || "";
    if (/^\s*(?:`{3,}|~{3,})/.test(fence)) element.dataset.ibChartAlign = chartAlignment(fence);
    this.blockSources.set(element, {
      path: context.sourcePath,
      lineStart: info.lineStart,
      lineEnd: info.lineEnd
    });
  }

  editLanguage(label, pre, context, current) {
    openLanguagePicker({
      anchor: label,
      current,
      onPick: async language => {
        if (language.toLowerCase() === current.toLowerCase()) return;
        await this.writeFenceLanguage(pre, context, language);
      }
    });
  }

  async writeFenceLanguage(pre, context, language) {
    const info = context?.getSectionInfo?.(pre);
    const file = context?.sourcePath
      ? this.app.vault.getAbstractFileByPath(context.sourcePath)
      : null;
    if (!info || !file) return false;

    const rewrite = data => {
      const lines = data.split("\n");
      const fence = lines[info.lineStart];
      if (!/^\s*(?:`{3,}|~{3,})/.test(fence)) return data;
      lines[info.lineStart] = withFenceLanguage(fence, language);
      return lines.join("\n");
    };

    await this.app.vault.process(file, rewrite);
    return true;
  }


  /* Obsidian's edit-block button selects the whole block. Collapse that to a
     caret at the start of the block's first line — for diagrams and for code
     blocks alike. */
  collapseSelectionAfterEdit() {
    const BLOCKS = ".cm-embed-block, .cm-html-embed, .cm-callout, [class*=\"ibc-container\"]";
    const handler = event => {
      if (!event.target.closest?.(".edit-block-button, .ibm-edit-source")) return;
      this.anchorEditedBlock(event.target);
      window.setTimeout(() => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!editor || !editor.somethingSelected()) return;
        editor.setCursor(editor.getCursor("from"));
      }, 0);
    };
    // A plain click on a rendered block can also reveal its source; hold the page still then too.
    const press = event => {
      const block = event.target instanceof Element ? event.target.closest(BLOCKS) : null;
      if (block && !event.target.closest(".edit-block-button, .ibm-edit-source")) this.anchorEditedBlock(block);
    };
    document.addEventListener("click", handler, true);
    document.addEventListener("mousedown", press, true);
    this.register(() => { document.removeEventListener("click", handler, true); document.removeEventListener("mousedown", press, true); });
  }

  anchorEditedBlock(target) {
    const block = target.closest?.(".cm-embed-block, .cm-html-embed, .cm-callout, [class*=\"ibc-container\"]");
    if (!block) return;
    const cm = this.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view?.editor?.cm).find(cm => cm?.dom.contains(block));
    if (cm) anchorBlockTop(cm, block);
  }


  /* Obsidian's edit-block button is absolutely positioned against the outer
     block wrapper, which is wider than our container — reserving space for it
     inside the header could never line the two up. Move it into the header
     instead, so the controls stay one group. It is created lazily, so retry. */

  /* One header for both block kinds. The only difference is whether the zoom
     group is present, so the slots — label, zoom, copy, edit — are always laid
     out the same way and nothing shifts between a diagram and a code block. */
  buildBlockHeader(container, options) {
    const header = document.createElement("div");
    header.className = "ibm-block-header";

    const title = document.createElement("div");
    title.className = "ibm-block-title";
    const icon = document.createElement("span");
    icon.className = "ibm-block-icon";
    if (options.language !== undefined) icon.appendChild(createLanguageIcon(options.language));
    else setIcon(icon, options.withZoom ? UI_ICONS.chart : UI_ICONS.code);
    title.appendChild(icon);

    const label = document.createElement(options.onRename ? "button" : "span");
    label.className = "ibm-block-label";
    label.textContent = options.label;
    if (options.onRename) {
      label.type = "button";
      label.classList.add("is-editable");
      label.title = t("changeLanguage");
      label.addEventListener("click", () => options.onRename(label));
    }
    title.appendChild(label);
    header.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "ibm-block-actions";
    header.appendChild(actions);

    let toolbar = null;
    if (options.withZoom) {
      toolbar = document.createElement("div");
      toolbar.className = "ibm-mermaid-toolbar";
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", t("controls"));
      toolbar.style.setProperty("--no-tooltip", "true");
      actions.appendChild(toolbar);
    }

    if (options.withZoom) mountChartAlignment(this, container, actions);
    actions.appendChild(this.createCopyButton(container));
    // Code blocks are edited through Obsidian itself; only diagrams get the button.
    if (options.withEdit !== false) actions.appendChild(this.createEditButton(container));
    return { header, actions, toolbar, label };
  }

  /* Our own edit button. Obsidian's is created lazily, parented to a wrapper we
     do not own and replaced on re-render — moving it around is what made the
     header lose buttons. Ours stays put and simply presses Obsidian's. */
  createEditButton(container) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ibm-edit-source";
    button.title = t("editSource");
    button.setAttribute("aria-label", t("editSource"));
    button.style.setProperty("--no-tooltip", "true");
    setIcon(button, UI_ICONS.code);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.editBlock(container);
    });
    return button;
  }

  editBlock(container) {
    const host = container.closest(".cm-embed-block, .cm-preview-code-block, .el-pre, .el-div");
    const native = host?.querySelector(".edit-block-button");
    if (native) {
      native.click();
      return;
    }
    // Reading view has no in-place editing of its own: open the note in Live
    // Preview with the caret inside this block, so Obsidian's editor reveals
    // just this block's source while everything else stays rendered.
    const stored = this.storedSourceFor(container);
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!stored || !view) {
      new Notice(t("editFailed"));
      return;
    }
    const state = view.getState();
    state.mode = "source";
    state.source = false;
    view.setState(state, { history: false }).then(() => {
      const position = { line: Math.min(stored.lineStart + 1, stored.lineEnd), ch: 0 };
      view.editor.setCursor(position);
      view.editor.scrollIntoView({ from: position, to: position }, true);
      view.editor.focus();
    });
  }

  /* Section info is kept for the <pre> itself and for its reading-view section
     wrapper (a diagram replaces the <pre>, the wrapper survives). */
  storedSourceFor(element) {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const stored = this.blockSources?.get(node);
      if (stored) return stored;
      if (node.matches(".markdown-preview-section, .markdown-rendered")) break;
    }
    return null;
  }

  createCopyButton(container) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ibm-copy-source";
    button.title = t("copySource");
    button.setAttribute("aria-label", t("copySource"));
    button.style.setProperty("--no-tooltip", "true");
    setIcon(button, UI_ICONS.copy);
    button.addEventListener("click", async () => {
      const source = await this.sourceForBlock(container);
      if (source === null) {
        new Notice(t("copyFailed"));
        return;
      }
      await navigator.clipboard.writeText(source);
      showCopyFeedback(button, t("copied"));
      new Notice(t("copied"));
    });
    return button;
  }

  /* The fenced source behind a rendered block. Reading view gives us the
     section info up front; in Live Preview the block is a CodeMirror widget, so
     ask the editor where the element sits and read the fence around it. */
  async sourceForBlock(element) {
    const echartsSource = this.echartsSources?.get(element);
    if (echartsSource !== undefined) return echartsSource;
    // A code block carries its own source; no need to go back to the file.
    const code = element.matches?.("pre") ? element.querySelector(":scope > code") : null;
    if (code) return code.textContent;

    const stored = this.storedSourceFor(element);
    if (stored) {
      const file = this.app.vault.getAbstractFileByPath(stored.path);
      if (file) {
        const text = await this.app.vault.cachedRead(file);
        return text.split("\n").slice(stored.lineStart + 1, stored.lineEnd).join("\n");
      }
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const cm = view?.editor?.cm;
    if (!cm) return null;
    try {
      const position = cm.posAtDOM(element);
      const doc = cm.state.doc;
      let line = doc.lineAt(position).number;
      const isFence = number => /^\s*(?:`{3,}|~{3,})/.test(doc.line(number).text);
      let start = line;
      while (start > 1 && !isFence(start)) start -= 1;
      let end = start + 1;
      while (end < doc.lines && !isFence(end)) end += 1;
      const lines = [];
      for (let number = start + 1; number < end; number += 1) lines.push(doc.line(number).text);
      return lines.join("\n");
    } catch (_) {
      return null;
    }
  }


  sweepBlocks() {
    for (const container of document.querySelectorAll(".mermaid")) {
      this.enhanceDiagram(container);
    }
  }



  async loadStoredState() {
    const stored = await this.loadData();
    this.state = Object.assign({
      density: "normal", tables: {}, accent: "none", customAccent: "#4D81EF", presentation: { skin: "none", animation: "none", canvas: "16:9" },
      appearance: appearanceDefaults(), tabs: tabDefaults(), smartPunctuation: false
    }, stored || {});
    this.state.presentation = { ...this.state.presentation, skin: normalizePresentationSkin(this.state.presentation?.skin) };
    delete this.state.htmlSkin;
    this.state.appearance = Object.assign(appearanceDefaults(), this.state.appearance || {});
    this.state.tabs = Object.assign(tabDefaults(), this.state.tabs || {});
    this.state.codeLineNumbers = this.state.codeLineNumbers === true;
    this.state.smartPunctuation = this.state.smartPunctuation === true;
    this.state.writingModes = Object.assign(writingModeDefaults(), this.state.writingModes || {});
    this.state.fileTools = Object.assign(fileToolsDefaults(), this.state.fileTools || {});
    this.state.webClip = Object.assign({ watchClipboard: false }, this.state.webClip || {});
    this.state.fileTools.apps = Array.isArray(this.state.fileTools.apps)
      ? this.state.fileTools.apps.filter(value => typeof value === "string")
      : [];
    delete this.state.pageDefaults;
    this.applyDensity();
    applyAppearancePreferences(this);
    this.applyCodeLineNumbers();
  }

  saveStoredState() {
    window.clearTimeout(this.saveTimer);
    // Page layout lives in per-device local storage, never in synced data.
    this.saveTimer = window.setTimeout(() => {
      const { page, ...synced } = this.state;
      this.saveData(synced);
    }, 250);
  }

  applyDensity() {
    for (const name of DENSITIES) {
      document.body.classList.toggle(`ibt-density-${name}`, this.state.density === name);
    }
  }

  applyCodeLineNumbers() {
    document.body.classList.toggle("ib-show-code-line-numbers", this.state?.codeLineNumbers === true);
  }

  cycleDensity() {
    const next = (DENSITIES.indexOf(this.state.density) + 1) % DENSITIES.length;
    this.state.density = DENSITIES[next];
    this.applyDensity();
    this.saveStoredState();
    new Notice(`${t("density")}: ${t(`density_${this.state.density}`)}`);
  }

  /* Stored sizes per table: { cols: [px|null…], rows: [px|null…] }. Older
     versions stored a bare array of column widths. */
  storedSizes(path, ordinal) {
    const raw = this.state.tables?.[path]?.[ordinal];
    if (!raw) return { cols: [], rows: [] };
    if (Array.isArray(raw)) return { cols: raw, rows: [] };
    return { cols: raw.cols || [], rows: raw.rows || [] };
  }

  storeSizes(path, ordinal, sizes) {
    if (path == null || ordinal === null) return;
    if (!this.state.tables[path]) this.state.tables[path] = {};
    const empty = !sizes.cols.some(Boolean) && !sizes.rows.some(Boolean);
    if (empty) {
      delete this.state.tables[path][ordinal];
      if (!Object.keys(this.state.tables[path]).length) delete this.state.tables[path];
    } else {
      this.state.tables[path][ordinal] = { cols: sizes.cols, rows: sizes.rows };
    }
    this.saveStoredState();
  }

  enhanceTables(root, context) {
    for (const table of root.querySelectorAll("table")) {
      if (table.closest(".cm-table-widget")) continue; // Live Preview is handled separately
      const info = context?.getSectionInfo?.(table);
      const path = context?.sourcePath;
      const ordinal = info && path ? tableOrdinal(info.text, info.lineStart) : null;
      this.attachTable(table, path, ordinal);
    }
  }

  /* Live Preview tables are CodeMirror widgets: no post-processor sees them,
     and the widget may rebuild its <table> at any time. Locate the table in
     the source through the editor, then attach as for reading view. */
  enhanceLiveTable(table) {
    const widget = table.closest(".cm-table-widget");
    if (!widget) return;
    let path = null, ordinal = null;
    this.app.workspace.iterateAllLeaves?.(leaf => {
      const view = leaf.view;
      if (path || !(view instanceof MarkdownView) || !view.containerEl.contains(widget)) return;
      const cm = view.editor?.cm;
      try {
        const line = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
        path = view.file?.path ?? null;
        // Same count as reading view: delimiter rows above the table's first line.
        ordinal = tableOrdinal(cm.state.doc.toString(), line);
      } catch (_) {}
    });
    this.attachTable(table, path, ordinal);
  }

  attachTable(table, path, ordinal) {
    if (table.classList.contains("ibt-enhanced")) return;
    if (headerCells(table).length < 1) return;
    table.classList.add("ibt-enhanced");

    const keyed = path != null && ordinal !== null && ordinal >= 0;
    const key = keyed ? tableKey(path, ordinal) : `tmp${Math.random().toString(36).slice(2, 8)}`;
    table.dataset.ibtKey = key;
    const sizes = keyed ? this.storedSizes(path, ordinal) : { cols: [], rows: [] };
    // While a Live Preview cell is being edited, every column is held at the
    // width it had when editing began. The hold is a stylesheet rule like the
    // stored sizes, so Obsidian clearing the cell's inline style cannot undo it.
    let hold = null;
    const publish = () => this.tableStyles.set(key, {
      cols: hold ? hold.map((width, index) => sizes.cols[index] || width) : sizes.cols,
      rows: sizes.rows,
      columnCount: headerCells(table).length
    }, rowSelectors(table));
    publish();

    const widget = table.closest(".cm-table-widget");
    if (widget && !widget.dataset.ibtHold) {
      widget.dataset.ibtHold = "1";
      // A click that starts an edit lands here first, before the editor exists.
      widget.addEventListener("pointerdown", () => {
        const current = widget.querySelector("table.ibt-enhanced");
        if (!hold && current) widget.ibtStable = headerCells(current).map(cell => Math.round(cell.getBoundingClientRect().width));
      }, true);
      widget.addEventListener("focusin", () => {
        const current = widget.querySelector("table.ibt-enhanced");
        if (hold || !current) return;
        hold = widget.ibtLayer?.stableCols || widget.ibtStable
          || headerCells(current).map(cell => Math.round(cell.getBoundingClientRect().width));
        widget.classList.add("ibt-holding");
        publish();
      });
      widget.addEventListener("focusout", event => {
        if (widget.contains(event.relatedTarget)) return;
        hold = null;
        widget.classList.remove("ibt-holding");
        publish();
      });
    }

    const layer = new TableResizeLayer(table, {
      alignmentControl: tableAlignmentControl(this, table, path, ordinal),
      isHolding: () => Boolean(hold),
      seedColumns: widths => {
        widths.forEach((width, index) => { if (!sizes.cols[index]) sizes.cols[index] = width; });
      },
      resize: (axis, index, size) => {
        (axis === "col" ? sizes.cols : sizes.rows)[index] = size;
        publish();
      },
      reset: (axis, index) => {
        (axis === "col" ? sizes.cols : sizes.rows)[index] = null;
        publish();
        if (keyed) this.storeSizes(path, ordinal, sizes);
      },
      commit: () => { if (keyed) this.storeSizes(path, ordinal, sizes); }
    });
    // Re-renders replace tables without notice; drop layers left detached.
    // Post-processed tables may not be in the document yet, so only a layer
    // seen connected before counts as stale.
    for (const stale of this.tableLayers) {
      if (stale.table.isConnected) stale.seenConnected = true;
      else if (stale.seenConnected) {
        // Drop the marker too: if CodeMirror puts this same <table> back, it must be attached again.
        stale.table.classList.remove("ibt-enhanced");
        stale.destroy();
        this.tableLayers.delete(stale);
      }
    }
    this.tableLayers.add(layer);
    if (widget) widget.ibtLayer = layer;
  }

  isDarkTheme() {
    return document.body.classList.contains("theme-dark");
  }

  repaintAll(force = false) {
    const isDark = this.isDarkTheme();
    for (const element of document.querySelectorAll(".mermaid.ibm-mermaid-enhanced > svg, .mermaid.ibm-mermaid-enhanced > .ibm-mermaid-canvas > svg")) {
      if (document.body.dataset.ibThemeCapture && !element.closest(".ibp-export,.ibp-staging")) continue;
      if (!force && element.getAttribute("data-ibm-theme") === (isDark ? "dark" : "light")) continue;
      paintDiagram(element, isDark);
    }
  }

  onunload() {
    document.querySelectorAll("pre.ibc-enhanced").forEach(pre => {
      guardedCleanup(() => {
      pre.querySelector(":scope > .ibm-block-header")?.remove();
      pre.classList.remove("ibc-enhanced", "ib-code-soft-wrap");
      }, "代码块清理")();
    });

    document.querySelectorAll(".mermaid.ibm-mermaid-enhanced").forEach(element => {
      guardedCleanup(() => {
      const state = this.diagramStates.get(element);
      state?.cleanup?.();
      element.classList.remove("ibm-mermaid-enhanced", "is-panning", "is-interactive");
      element.querySelector(":scope > .ibm-block-header")?.remove();
      const svg = element.querySelector(".ibm-mermaid-canvas > svg, :scope > svg");
      if (svg) {
        clearPaint(svg);
        svg.style.removeProperty("transform");
        svg.style.removeProperty("transform-origin");
      }
      }, "图表清理")();
    });
  }

  enhanceAll(root) {
    const diagrams = [];
    if (root.matches?.(".mermaid")) diagrams.push(root);
    root.querySelectorAll?.(".mermaid").forEach(element => diagrams.push(element));
    this.enhanceDiagrams(diagrams);
  }

  /* Measuring happens in flushRetighten, batched per frame: measuring here
     forced a full layout of the note for every rendered diagram. */
  enhanceDiagrams(diagrams) {
    for (const diagram of diagrams) {
      if (diagram.classList.contains("ibm-mermaid-enhanced") && !diagram.querySelector(":scope > svg")) continue;
      // A deck mounts every slide at once; enhancing each synchronously held the thread for seconds.
      if (diagram.closest(".ibp-staging, .ibp-presentation-stage")) this.diagramEnhancements.enqueue(diagram);
      else this.enhanceDiagram(diagram);
    }
  }

  /* A diagram container is only enhanceable once its <svg> exists; Obsidian
     inserts the two separately, so this is called from several angles. */

  disposeDiagram(container) {
    const state = this.diagramStates.get(container);
    if (!state) return;
    state.cleanup?.();
    this.diagramStates.delete(container);
    this.retightenQueue?.delete(container);
    container.classList.remove("ibm-mermaid-enhanced", "is-panning", "is-interactive");
    container.querySelector(":scope > .ibm-block-header")?.remove();
    state.svg.style.removeProperty("transform");
    state.svg.style.removeProperty("transform-origin");
  }

  enhanceDiagram(container) {
    // Paged pages hold frozen copies laid out from the staging strip; enhancing
    // them again would refit them to the page and change their height.
    if (container.closest?.(".ibp-book")) return;
    // The native reader is covered by paged output. Staging still needs
    // enhancement; leaving paging rerenders the native reader from source.
    if (this.state.page.paged && container.closest?.(".ibp-has-book") && !container.closest?.(".ibp-staging, .ibp-export")) return;
    // Obsidian renders into a hidden <div class="mermaid"> hung straight off
    // <body>, then copies the SVG string out. Touching that scratch div mid-
    // render corrupts what it copies, so leave it alone.
    if (container.parentElement === document.body) return;
    if (container.classList.contains("ibm-mermaid-enhanced")) {
      // A re-render drops a fresh <svg> straight into the container, outside
      // our canvas. Tear the old scaffolding down and build it again.
      if (!container.querySelector(":scope > svg")) return;
      this.diagramStates.get(container)?.cleanup?.();
      container.classList.remove("ibm-mermaid-enhanced", "is-panning");
      delete container.dataset.ibmHint;
      container.querySelector(":scope > .ibm-block-header")?.remove();
      container.querySelector(":scope > .ibm-mermaid-canvas")?.remove();
    }

    const svg = container.querySelector(":scope > svg");
    if (!svg) return;

    // The first retighten tightens the viewBox, before the next paint.
    paintDiagram(svg, this.isDarkTheme());
    for (const labels of svg.querySelectorAll("g.edgeLabels")) labels.parentElement?.appendChild(labels);

    container.classList.add("ibm-mermaid-enhanced");
    markContext(container);
    const { header, toolbar } = this.buildBlockHeader(container, {
      label: diagramLabel(svg),
      withZoom: true
    });
    container.appendChild(header);

    const makeButton = (label, title) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.title = title;
      button.setAttribute("aria-label", title);
      button.style.setProperty("--no-tooltip", "true");
      toolbar.appendChild(button);
      return button;
    };

    const zoomOut = makeButton("", t("zoomOut"));
    setIcon(zoomOut, UI_ICONS.zoomOut);
    const percent = makeButton("100%", t("fitTitle"));
    percent.className = "ibm-mermaid-percent";
    const zoomIn = makeButton("", t("zoomIn"));
    setIcon(zoomIn, UI_ICONS.zoomIn);

    const canvas = document.createElement("div");
    canvas.className = "ibm-mermaid-canvas";
    // Obsidian's mobile sidebar swipe skips anything inside
    // [data-ignore-swipe] — the same marker its Canvas view uses — so a
    // horizontal drag on the diagram pans it instead of opening a drawer.
    canvas.setAttribute("data-ignore-swipe", "true");
    canvas.appendChild(svg);
    container.appendChild(canvas);
    // Reserve the height this diagram settled at last time, so it does not grow after it scrolls in.
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const key = diagramHeightKey(svg, viewBox);
      container.dataset.ibHeightKey = key;
      const remembered = this.heightMemory?.get(key);
      if (remembered) container.style.setProperty("--ibm-mermaid-canvas-height", `${remembered}px`);
    }

    const state: any = {
      svg,
      canvas,
      container,
      toolbar,
      scale: 1,
      x: 0,
      y: 0,
      pointerId: null,
      lastX: 0,
      lastY: 0,
      percent
    };
    this.diagramStates.set(container, state);

    const apply = () => {
      state.scale = Math.min(Math.max(8, state.readableMinimum || 0), Math.max(0.001, state.scale));
      // Once the reader zooms by hand the frame stays as it is: the picture is magnified inside it and the note
      // around it does not reflow. Fitting again (double-click, the percentage) lets the frame size itself.
      if (!state.lockFrame) this.sizeCanvas(container, state);
      svg.style.transformOrigin = "50% 0";
      // Cancel the drawing's offset inside its own box so the ink itself is
      // centred horizontally and hangs from the top gutter.
      const drawn = this.drawnSizes?.get(svg);
      const shiftX = drawn ? -drawn.offsetX * state.scale : 0;
      const shiftY = drawn ? -drawn.offsetY * state.scale : 0;
      svg.style.transform = `translate(-50%, 0) translate(${state.x + shiftX}px, ${state.y + shiftY}px) scale(${state.scale})`;
      percent.textContent = `${Math.round(state.scale * 100)}%`;
    };

    const zoomAt = (nextScale, clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      if (!state.readableScroll) state.lockFrame = true;
      if (state.readableScroll) {
        const oldScale = state.scale;
        const left = canvas.scrollLeft, top = canvas.scrollTop;
        const x = clientX - rect.left, y = clientY - rect.top;
        state.scale = Math.min(Math.max(8, state.readableMinimum || 0), Math.max(0.05, nextScale));
        apply();
        const ratio = state.scale / oldScale;
        canvas.scrollLeft = Math.max(0, (left + x - 8) * ratio - x + 8);
        canvas.scrollTop = Math.max(0, (top + y - 8) * ratio - y + 8);
        return;
      }
      const pointX = clientX - rect.left - rect.width / 2;
      // The drawing hangs from the top gutter, so that is the zoom origin's y.
      const pointY = clientY - rect.top - 8;
      const previousScale = state.scale;
      const boundedScale = Math.min(8, Math.max(0.05, nextScale));
      const ratio = boundedScale / previousScale;
      state.scale = boundedScale;
      const { width } = this.getDiagramSize(svg);
      const parentWidth = this.availableWidth(container);
      const fillsAvailableWidth = state.lockFrame || width * boundedScale + 24 >= parentWidth;
      if (fillsAvailableWidth) {
        state.x = pointX - (pointX - state.x) * ratio;
        state.y = pointY - (pointY - state.y) * ratio;
      } else {
        state.x = 0;
        state.y = 0;
      }
      apply();
    };

    /* Gestures without a mode switch:
       - mouse / pen: drag pans straight away (a few px of slop keeps clicks);
       - touch, one finger: `touch-action: pan-y` lets the browser keep
         vertical swipes for page scrolling; only a horizontal-leaning drag
         reaches us, and then it pans freely;
       - touch, two fingers: pinch zooms around the midpoint and pans;
       - trackpad: pinch (ctrl+wheel) zooms, a horizontal swipe pans sideways,
         a vertical swipe keeps scrolling the page. */
    const pointers = new Map();
    let pinch = null;
    let dragging = false;
    let lastDragEnd = 0;
    const DRAG_SLOP = 4;

    const midpoint = () => {
      const [a, b] = [...pointers.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };
    const endGesture = () => {
      dragging = false;
      pinch = null;
      container.classList.remove("is-panning");
    };

    const onPointerDown = event => {
      if (event.target.closest(".ibm-mermaid-toolbar, .ibm-block-header")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY });
      if (pointers.size === 2) {
        pinch = { ...midpoint(), scale: state.scale };
        dragging = true;
        container.classList.add("is-panning");
      }
    };
    const onPointerMove = event => {
      const p = pointers.get(event.pointerId);
      if (!p) return;
      const dx = event.clientX - p.x;
      const dy = event.clientY - p.y;
      p.x = event.clientX;
      p.y = event.clientY;

      if (pinch && pointers.size >= 2) {
        const m = midpoint();
        if (state.readableScroll) {
          canvas.scrollLeft -= m.x - pinch.x;
          canvas.scrollTop -= m.y - pinch.y;
        } else {
          state.x += m.x - pinch.x;
          state.y += m.y - pinch.y;
        }
        pinch.x = m.x;
        pinch.y = m.y;
        zoomAt(pinch.scale * (m.d / pinch.d), m.x, m.y);
        return;
      }
      if (!dragging) {
        const ox = event.clientX - p.sx;
        const oy = event.clientY - p.sy;
        if (Math.hypot(ox, oy) < DRAG_SLOP) return;
        // One finger, vertical-leaning: the page scrolls, the diagram stays
        // put. Drop the pointer so the rest of this swipe is ignored.
        if (event.pointerType === "touch" && Math.abs(oy) >= Math.abs(ox)) {
          pointers.delete(event.pointerId);
          return;
        }
        dragging = true;
        container.classList.add("is-panning");
        try { container.setPointerCapture(event.pointerId); } catch (_) {}
      }
      event.preventDefault();
      if (state.readableScroll) {
        canvas.scrollLeft -= dx;
        canvas.scrollTop -= dy;
        return;
      }
      state.x += dx;
      state.y += dy;
      apply();
    };
    const onPointerUp = event => {
      if (!pointers.delete(event.pointerId)) return;
      if (container.hasPointerCapture?.(event.pointerId)) container.releasePointerCapture(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) endGesture();
      else for (const q of pointers.values()) { q.sx = q.x; q.sy = q.y; }
    };
    // A drag that ended on the diagram should not also count as a click.
    const onClickCapture = event => {
      if (performance.now() - lastDragEnd < 250) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    const markDrag = () => {
      if (!dragging) return;
      lastDragEnd = performance.now();
    };
    const onWheel = event => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        // A trackpad fires many notches per swipe, so keep each one small and
        // scale it with the reported delta rather than using a fixed step.
        const step = Math.min(0.06, Math.abs(event.deltaY) * 0.0016);
        const factor = event.deltaY < 0 ? 1 + step : 1 - step;
        zoomAt(state.scale * factor, event.clientX, event.clientY);
        return;
      }
      // Sideways swipe pans; vertical stays with the page.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.2) {
        if (state.readableScroll) return; // Native horizontal scrolling.
        event.preventDefault();
        state.x -= event.deltaX;
        apply();
      }
    };
    // Double-click refits instead of toggling a mode.
    const onDoubleClick = event => {
      if (event.target.closest(".ibm-mermaid-toolbar, .ibm-block-header")) return;
      event.preventDefault();
      this.fitDiagram(container, state);
    };
    const onPointerUpCapture = () => markDrag();
    // Once the diagram owns a touch gesture (horizontal pan or pinch), keep
    // the page from scrolling underneath it.
    const onTouchMove = event => {
      if (dragging || pointers.size >= 2) event.preventDefault();
    };
    container.addEventListener("touchmove", onTouchMove, { passive: false });

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerUpCapture, true);
    container.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("click", onClickCapture, true);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dblclick", onDoubleClick);
    const zoomFromCenter = factor => {
      const rect = canvas.getBoundingClientRect();
      zoomAt(state.scale * factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
    };
    zoomOut.addEventListener("click", () => zoomFromCenter(1 / 1.1));
    zoomIn.addEventListener("click", () => zoomFromCenter(1.1));
    // Clicking the readout refits the diagram — that is what the separate Fit
    // button used to do.
    percent.addEventListener("click", () => this.fitDiagram(container, state));

    // Watch the text column, not the block: the block itself widens when it
    // bleeds into the margins, and that must not count as a resize.
    const column = () => this.bleedTarget(container).parentElement;
    // Recorded on the observer's first call, when layout is already clean;
    // reading it here forced a layout of the note per diagram.
    let lastParentWidth = null;
    const resizeObserver = new ResizeObserver(() => {
      const nextParentWidth = column()?.clientWidth || 0;
      if (lastParentWidth === null) { lastParentWidth = nextParentWidth; return; }
      if (Math.abs(nextParentWidth - lastParentWidth) < 2) return;
      lastParentWidth = nextParentWidth;
      if (!container.classList.contains("is-panning")) this.scheduleRetighten(container, state, svg);
    });
    if (column()) resizeObserver.observe(column());
    const pane = container.closest(".markdown-preview-view, .cm-scroller");
    if (pane) resizeObserver.observe(pane);

    state.apply = apply;
    const onGeometryChange = () => { if (!state.disposed) this.scheduleRetighten(container, state, svg); };
    state.cleanup = () => {
      if (state.disposed) return;
      state.disposed = true;
      svg.removeEventListener("ibm-geometry-change", onGeometryChange);
      resizeObserver.disconnect();
      state.visibility?.disconnect();
      clearPaint(svg);
      if (canvas.parentElement === container) container.insertBefore(svg, canvas);
      canvas.remove();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUpCapture, true);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("click", onClickCapture, true);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("dblclick", onDoubleClick);
      if (svg.dataset.ibmOriginalViewBox) {
        svg.setAttribute("viewBox", svg.dataset.ibmOriginalViewBox);
        delete svg.dataset.ibmOriginalViewBox;
      }
      svg.style.removeProperty("width");
      svg.style.removeProperty("height");
      svg.style.removeProperty("max-width");
      svg.style.removeProperty("max-height");
      this.setBleed(container, 0);
      container.classList.remove("is-readable-scroll");
      for (const name of ["--ibm-readable-width", "--ibm-readable-height", "--ibm-readable-center"]) container.style.removeProperty(name);
    };

    // Batched with every other diagram refitting this frame (see flushRetighten).
    const retighten = () => { if (!state.disposed && container.isConnected) this.scheduleRetighten(container, state, svg); };
    window.requestAnimationFrame(retighten);
    // Font loading is the actual late geometry change. Fixed retries refitted
    // every SVG twice even when no geometry had changed.
    if (document.fonts?.status === "loading") document.fonts.ready.then(() => { if (container.isConnected) retighten(); });
    // Geometry fixes that run once the diagram is measurable (see
    // whenMeasurable) change the viewBox after this fit; refit when they do.
    svg.addEventListener("ibm-geometry-change", onGeometryChange);

    // Obsidian renders Mermaid inside a hidden, absolutely positioned div and
    // moves the result in afterwards, so the first measurement can land while
    // the SVG has no box at all. Re-measure the moment it becomes visible.
    const visibility = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      visibility.disconnect();
      retighten();
    });
    visibility.observe(container);
    state.visibility = visibility;
  }

  /* The tallest the canvas may get before a diagram is shrunk to fit it. */
  maxCanvasHeight() {
    return Math.max(140, Math.min(HALF_A4_HEIGHT - DIAGRAM_HEADER_HEIGHT, window.innerHeight * .72 - DIAGRAM_HEADER_HEIGHT));
  }

  /* Refit a bounded group in phases — all writes, then all reads — instead
     of fitting every diagram synchronously in one frame. */
  scheduleRetighten(container, state, svg) {
    if (!this.retightenQueue) this.retightenQueue = new Map();
    this.retightenQueue.set(container, { state, svg });
    if (this.retightenFrame) return;
    this.retightenFrame = window.requestAnimationFrame(() => {
      this.retightenFrame = 0;
      this.flushRetighten();
    });
  }

  flushRetighten() {
    const eligible = [...this.retightenQueue].filter(([container, job]) => container.isConnected && !job.state.disposed && job.svg.isConnected && !(this.state.page.paged && container.closest(".ibp-has-book") && !container.closest(".ibp-staging, .ibp-export"))).map(([container, job]) => ({ container, ...job }));
    this.retightenQueue.clear();
    // Bound fitting work per frame; a long note can otherwise force every
    // SVG layout in one task. Consumers wait for their own stage to finish.
    const jobs = eligible.slice(0, 1);
    for (const job of eligible.slice(1)) this.retightenQueue.set(job.container, job);
    if (this.retightenQueue.size) {
      this.retightenFrame = window.requestAnimationFrame(() => {
        this.retightenFrame = 0;
        this.flushRetighten();
      });
    }
    if (!jobs.length) return;
    // Measure against the plain text column. With the block still bled into
    // the margins, an SVG sized in % grew with it, measured larger, fitted
    // smaller, and the diagram ended up small inside wide empty bands.
    for (const job of jobs) this.setBleed(job.container, 0);
    // Column widths hold still while refitting; reading them per diagram
    // between writes laid out the whole note twice per diagram.
    this.baseWidths = new Map(jobs.map(job => [job.container, this.availableWidth(job.container)]));
    try { this.refitJobs(jobs); }
    finally { this.baseWidths = null; }
  }

  async settleDiagramFits(root, signal) {
    while (root.isConnected) {
      signal?.throwIfAborted();
      const pending = [...root.querySelectorAll(".mermaid")].some(container => {
        if (this.diagramEnhancements?.has(container)) return true;
        const state = this.diagramStates.get(container);
        return state && !state.disposed && (!state.fitted || this.retightenQueue?.has(container));
      });
      if (!pending) return;
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    }
  }

  refitJobs(jobs) {
    // Background geometry updates must not undo a reader's internal scroll.
    // Explicit fitDiagram calls still reset the viewport through applyFit.
    const scrollPositions = new Map(jobs.filter(job => job.state.fitted).map(job => [job.state, {
      left: job.state.canvas.scrollLeft, top: job.state.canvas.scrollTop
    }]));
    for (const job of jobs) {
      try { this.measuredBounds.set(job.svg, measureRenderedContent(job.svg)); } catch (_) {}
    }
    for (const { svg, state } of jobs) {
      this.tightenViewBox(svg);
      // Pin the SVG box to its viewBox in px so it never follows the canvas.
      const box = svg.viewBox?.baseVal;
      if (box?.width && box?.height) {
        svg.style.setProperty("width", `${Math.ceil(box.width)}px`, "important");
        svg.style.setProperty("height", `${Math.ceil(box.height)}px`, "important");
        svg.style.setProperty("max-width", "none", "important");
        svg.style.setProperty("max-height", "none", "important");
      }
      // Measure the real drawing at 100%, then fit from that.
      state.lockFrame = false;
      state.scale = 1;
      state.x = 0;
      state.y = 0;
      this.drawnSizes?.delete(svg);
      state.apply?.();
    }
    if (!this.drawnSizes) this.drawnSizes = new WeakMap();
    for (const job of jobs) {
      const drawn = measureDrawnSize(job.svg);
      if (drawn) this.drawnSizes.set(job.svg, drawn);
      job.state.minimumFontPx = measureDiagramFont(job.svg, job.state.scale);
      job.fit = this.measureFit(job.container, job.state);
    }
    for (const job of jobs) {
      this.applyFit(job.state, job.fit);
      const position = scrollPositions.get(job.state);
      if (position && job.state.readableScroll) {
        job.state.canvas.scrollLeft = position.left;
        job.state.canvas.scrollTop = position.top;
      }
    }
  }

  fitDiagram(container, state) {
    this.applyFit(state, this.measureFit(container, state));
  }

  applyFit(state, scale) {
    state.lockFrame = false;
    state.scale = scale;
    state.x = 0;
    state.y = 0;
    state.apply?.();
    state.canvas.scrollLeft = 0;
    state.canvas.scrollTop = 0;
    state.fitted = true;
    const key = state.container?.dataset.ibHeightKey;
    if (key) this.heightMemory?.set(key, parseFloat(state.container.style.getPropertyValue("--ibm-mermaid-canvas-height")));
  }

  measureFit(container, state) {
    const { width, height } = this.getDiagramSize(state.svg);
    // Width: the text column plus whatever spare page width sits beside it.
    const bleed = Number(this.bleedTarget(container).dataset.ibmBleed || 0);
    const column = this.baseWidths?.get(container) ?? this.availableWidth(container) - bleed * 2;
    const room = column + this.maxBleed(container) * 2;
    const usableWidth = Math.max(100, room - 24);
    const fit = diagramFit(width, height, usableWidth, window.innerHeight);
    state.fitHeightLimit = fit.canvasLimit;
    container.classList.toggle("is-long-diagram", fit.long);
    const readable = fit.scale;
    state.readableMinimum = 0;
    state.readableScroll = false;
    return readable;
  }

  /* The space the drawing can use: the canvas itself. The block's parent can
     be wider than the canvas (Live Preview's embed wrapper is), and fitting to
     it let a flowchart overflow both sides by 22px. */
  availableWidth(container) {
    // Compact cards must still fit against the text column, not their own
    // previous width; otherwise repeated fits progressively shrink them.
    const column = this.bleedTarget(container).parentElement;
    if (column?.clientWidth) {
      const style = getComputedStyle(column);
      const text = column.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      // An authored width (dragged on the block) is the room the drawing has.
      const authored = Number(container.dataset.ibChartWidth) || 0;
      return authored ? Math.min(authored, text) : text;
    }
    const canvas = container.querySelector(":scope > .ibm-mermaid-canvas");
    return canvas?.clientWidth || container.clientWidth || 800;
  }

  /* The size the drawing actually occupies on screen at 100%, once measured.
     Deriving it from the viewBox is what left bands of empty canvas: inside
     Obsidian the viewBox-to-pixels ratio is not the one we set, so the canvas
     came out 1.5-2x taller (and wider) than the drawing. */
  getDiagramSize(svg) {
    const measured = this.drawnSizes?.get(svg);
    if (measured) return measured;
    const viewBox = svg.viewBox?.baseVal;
    let width = viewBox?.width || Number(svg.getAttribute("width")) || 800;
    let height = viewBox?.height || Number(svg.getAttribute("height")) || 450;
    if (!width || !height) {
      const bounds = svg.getBBox();
      width = bounds.width || 800;
      height = bounds.height || 450;
    }
    return { width, height };
  }

  tightenViewBox(svg) {
    try {
      const measured = this.measuredBounds.get(svg);
      this.measuredBounds.delete(svg);
      const bounds = measured !== undefined ? measured : measureRenderedContent(svg);
      if (!bounds) return;
      const original = svg.getAttribute("viewBox");
      if (original) svg.dataset.ibmOriginalViewBox = original;
      // Proportional padding: a fixed 12px is generous on a 40px-tall block
      // diagram and stingy on a full-page flowchart.
      const padding = Math.max(3, Math.min(6, Math.min(bounds.width, bounds.height) * 0.04));
      const fittedWidth = bounds.width + padding * 2;
      const fittedHeight = bounds.height + padding * 2;
      svg.setAttribute("viewBox", [
        bounds.x - padding,
        bounds.y - padding,
        fittedWidth,
        fittedHeight
      ].join(" "));
      // Keep the CSS box and viewBox in the same coordinate system. Without
      // this, Mermaid's original width/height can leave a large empty canvas.
      svg.style.setProperty("width", `${Math.ceil(fittedWidth)}px`, "important");
      svg.style.setProperty("height", `${Math.ceil(fittedHeight)}px`, "important");
      // Obsidian's and the theme's `.mermaid svg { max-width: 100% !important;
      // max-height: calc(100vh - …) !important }` clamp the box to the canvas;
      // the drawing then shrinks inside it on top of our own zoom. Only an
      // inline !important outranks those.
      svg.style.setProperty("max-width", "none", "important");
      svg.style.setProperty("max-height", "none", "important");
    } catch (_) {
      // Some transient Mermaid SVGs are not measurable until the next render.
    }
  }

  /* The element that sits in the text column: Live Preview wraps the block
     in .cm-embed-block, which carries the visible frame there. */
  bleedTarget(container) {
    return container.closest(".cm-embed-block") || container;
  }

  /* How far the block may grow past the readable line width on each side:
     the smaller of the two gaps between the column and the pane's padding,
     so the block stays centred on the text. */
  maxBleed(container) {
    // With the page toolbar the text width is the user's choice: diagrams stay
    // inside it (zoom past it pans inside the card) instead of bleeding out.
    if (document.body.style.getPropertyValue("--ib-content-max")) return 0;
    if (container.dataset.ibChartWidth) return 0;
    const target = this.bleedTarget(container);
    const column = target.parentElement;
    const pane = container.closest(".markdown-preview-view, .cm-scroller");
    if (!column || !pane) return 0;
    const paneRect = pane.getBoundingClientRect();
    const colRect = column.getBoundingClientRect();
    const inset = 16;
    const left = colRect.left - paneRect.left - inset;
    const right = paneRect.right - colRect.right - inset - (pane.offsetWidth - pane.clientWidth);
    return Math.max(0, Math.floor(Math.min(left, right)));
  }

  setBleed(container, perSide) {
    const target = this.bleedTarget(container);
    const value = Math.max(0, Math.round(perSide));
    if (Number(target.dataset.ibmBleed || 0) === value) return;
    if (value) {
      target.dataset.ibmBleed = String(value);
      target.style.setProperty("width", `calc(100% + ${value * 2}px)`, "important");
      target.style.setProperty("max-width", "none", "important");
      target.style.setProperty("margin-left", `-${value}px`, "important");
      target.style.setProperty("margin-right", `-${value}px`, "important");
    } else {
      delete target.dataset.ibmBleed;
      for (const prop of ["width", "max-width", "margin-left", "margin-right"]) target.style.removeProperty(prop);
    }
  }

  sizeCanvas(container, state) {
    const { width, height } = this.getDiagramSize(state.svg);
    const gutter = 8;
    const contentWidth = width * state.scale;
    const contentHeight = height * state.scale;
    container.style.setProperty("--ibm-diagram-card-width", `${Math.ceil(Math.max(320, contentWidth + gutter * 2))}px`);
    this.bleedTarget(container).style.setProperty("--ibm-diagram-card-width", `${Math.ceil(Math.max(320, contentWidth + gutter * 2))}px`);

    // Base width = the canvas as it would be without any bleed.
    const currentBleed = Number(this.bleedTarget(container).dataset.ibmBleed || 0);
    const baseWidth = this.baseWidths?.get(container) ?? this.availableWidth(container) - currentBleed * 2;
    // Zoomed past the text column: if the pane has spare width beside it
    // (readable line width on a wide window), let the block grow into it so
    // more of the diagram shows instead of being cropped.
    const overflow = contentWidth + gutter * 2 - baseWidth;
    const bleed = overflow > 0 ? Math.min(this.maxBleed(container), overflow / 2) : 0;
    this.setBleed(container, bleed);
    const parentWidth = baseWidth + Math.round(bleed) * 2;

    const fillsAvailableWidth = contentWidth + gutter * 2 >= parentWidth;
    // A diagram that already fills the width gets a capped viewport to pan in;
    // anything smaller is exactly as tall as it draws.
    // Exactly as tall as the drawing, capped; zooming past the cap pans.
    const readable = state.readableScroll;
    const canvasHeight = Math.min(state.fitHeightLimit || this.maxCanvasHeight(), contentHeight + gutter * 2) + (readable ? 16 : 0);
    container.classList.toggle("is-readable-scroll", !!readable);
    if (readable) {
      state.x = 0;
      state.y = 0;
      const scrollWidth = Math.max(parentWidth, contentWidth + gutter * 2);
      container.style.setProperty("--ibm-readable-width", `${Math.ceil(scrollWidth)}px`);
      container.style.setProperty("--ibm-readable-height", `${Math.ceil(contentHeight + gutter * 2)}px`);
      container.style.setProperty("--ibm-readable-center", `${scrollWidth / 2}px`);
    }
    container.classList.toggle("is-contained", fillsAvailableWidth);
    container.style.setProperty("--ibm-mermaid-canvas-height", `${Math.round(canvasHeight)}px`);
  }
}

/* --------------------------------------------------------------------------
 * Appearance controls
 *
 * The sidebar controls and plugin settings page share plugin state.
 * Accent presets use body classes; custom colors use derived palette variables
 * to keep contrast readable in both color schemes.
 * -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
 * [toc]
 *
 * Typora renders a line holding only [toc] as the note's table of contents;
 * Obsidian shows the literal text. Headings come from the metadata cache, so
 * the list follows edits. Reading view (and everything built on
 * MarkdownRenderer: the paged view, PDF and image export) gets it through a
 * post processor; the editor gets a widget that steps aside whenever the
 * cursor is on the [toc] line, so the source stays editable.
 * -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
 * Paged editor
 *
 * In paged mode the editor sits on sheets (see refreshPageNumbers), but lines
 * flow straight through page bottoms. This measures every top-level block
 * (a line, or an embed/diagram widget) and, where one would cross into the
 * bottom margin, pads the block above it (padding-bottom, a line decoration)
 * so it starts below the next page's top margin. A heading left last on a
 * page moves down with its block. Blocks taller than a page stay where they
 * are. CodeMirror measures the padding as part of the line, so cursor and
 * selection geometry stay correct. Positions are computed with our own
 * padding subtracted, so re-measuring converges instead of creeping.
 * -------------------------------------------------------------------------- */

module.exports = IgnoranceBlueMermaidPlugin;
