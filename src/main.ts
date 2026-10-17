import type { TFile } from "obsidian";
import type { PluginState } from "./plugin-types.js";
import { Notice, Plugin, MarkdownView, MarkdownRenderer, Component, Platform, View } from "obsidian";
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
import { installReadingTime } from "./modules/reading-time.js";
import { openSyntaxGuide, showFirstRunHint } from "./modules/syntax-guide.js";
import { installHeadingNumbers } from "./modules/heading-numbers.js";
import { addLenientCommand, installLenientBlocks, lenientBlocksEditorExtension } from "./modules/missing-blank-lines.js";
import { headingNumbersEditorExtension } from "./modules/heading-numbers-editor.js";
import { captionsEditorExtension } from "./modules/captions-editor.js";
import { quoteIndentExtension } from "./modules/quote-indent.js";
import { installTableExtras } from "./modules/table-merge.js";
import { installCaptions } from "./modules/captions.js";
import { installReadingCover } from "./modules/reading-cover.js";
import { installGifClick } from "./modules/gif-click.js";
import { installTableCrosshair } from "./modules/table-crosshair.js";
import { installNativeChapterSource } from "./modules/native-chapter-source.js";
import { installCodeFold } from "./modules/code-fold.js";
import { openLinkCheck } from "./modules/link-check.js";
import { openNavigation } from "./modules/navigation.js";
import { NAVIGATION_VIEW, createNavigationView, openNavigationView } from "./modules/navigation-view.js";
import { installGrayMode } from "./modules/gray-mode.js";
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
import * as DiagramLayout from "./plugin/diagram-layout.js";

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
  declare state: PluginState;
  declare measuredBounds: WeakMap<Element, any>;
  declare fileTools: Readonly<Record<string, any>>;
  declare diagramStates: WeakMap<Element, any>;
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
  async onload() {
    setChunkHost(this);
    this.measuredBounds = new WeakMap();
    this.fileTools = Object.freeze({
      isMarkdownImportSource,
      importVaultFileAsMarkdown: (file: TFile, noteName) => importVaultFileAsMarkdown(this, file, noteName)
    });
    this.diagramStates = new WeakMap();
    this.diagramEnhancements = createAfterPaintQueue((container: HTMLElement) => this.enhanceDiagram(container));
    this.register(() => this.diagramEnhancements.clear());
    setPageRefreshHandler(refreshBooks);
    this.registerEditorExtension(mermaidHighlighter);
    // [toc]: a table of contents in reading view, exports and the editor.
    this.registerEditorExtension(tocExtension(this));
    // Render Markdown ::: containers while the cursor is outside their source.
    this.registerEditorExtension(containerEditorExtension(this));
    this.registerEditorExtension(inlineSyntaxEditorExtension(this));
    this.registerEditorExtension(headingNumbersEditorExtension(this));
    this.registerEditorExtension(lenientBlocksEditorExtension(this));
    addLenientCommand(this);
    this.registerEditorExtension(captionsEditorExtension(this));
    this.registerEditorExtension(quoteIndentExtension);
    // Paged view in the editor: push blocks that would cross a page bottom.
    // Format Markdown tables and provide cell/row keyboard navigation.
    this.registerEditorExtension(tableEditorExtension);
    // Marker keys wrap the current non-empty selection.
    this.registerEditorExtension(wrapSelectionExtension);
    this.registerEditorExtension(colorSwatchExtension);
    this.registerEditorExtension(smartPunctuationExtension(this));
    this.registerMarkdownPostProcessor((element, context) => renderTocBlocks(this, element, context.sourcePath));
    this.registerMarkdownPostProcessor((element, context) => renderContainerBlocks(this, element, context));
    this.registerMarkdownPostProcessor(element => renderInlineSyntax(this, element));
    this.registerMarkdownPostProcessor(element => colorSwatchPostProcessor(element));
    installHeadingNumbers(this);
    installLenientBlocks(this);
    installTableExtras(this);
    installCaptions(this);
    installReadingCover(this);
    installGifClick(this);
    installTableCrosshair(this);
    installNativeChapterSource(this);
    installCodeFold(this);
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
    installReadingTime(this);
    installGrayMode(this);
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
          if (!(node.instanceOf(Element)) || node.matches(".ibp-book") || node.closest(".ibp-book")) continue;
          if (node.matches(".mermaid.ibm-mermaid-enhanced")) removedDiagrams.add(node);
          node.querySelectorAll(".mermaid.ibm-mermaid-enhanced").forEach(element => removedDiagrams.add(element));
        }
        for (const node of mutation.addedNodes) {
          // An <svg> is an SVGElement, not an HTMLElement — testing for the
          // latter dropped every diagram whose container was inserted empty and
          // filled in afterwards.
          if (!(node.instanceOf(Element))) continue;
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
    const syncTablePositions = (file?: TFile) => [150, 700, 1800].forEach(delay => window.setTimeout(() => {
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
    this.app.workspace.onLayoutReady(() => { installTabOpening(this); showFirstRunHint(this); });

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

    this.registerView(NAVIGATION_VIEW, leaf => new (createNavigationView(this))(leaf));
    this.addCommand({
      id: "open-navigation-view",
      name: "在侧栏打开导航",
      callback: () => void openNavigationView(this)
    });

    this.addCommand({
      id: "note-navigation",
      name: "跳到标题、图表、表格或代码",
      callback: () => openNavigation(this)
    });

    this.addCommand({
      id: "check-note-links",
      name: "检查当前笔记的链接和标题",
      callback: () => openLinkCheck(this)
    });

    this.addCommand({
      id: "open-syntax-guide",
      name: "打开语法速查",
      callback: () => void openSyntaxGuide(this)
    });

    this.addCommand({
      id: "reset-active-mermaid-view",
      name: t("resetCommand"),
      callback: () => {
        const container = this.app.workspace.getActiveViewOfType(View)?.containerEl;
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
      mermaid: window.mermaid,
      descriptor: Object.getOwnPropertyDescriptor(window, "mermaid")
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
    this.ensureMermaid = ensure;
    this.register(() => {
      const native = overwrites[overwrites.length - 1] || previous.mermaid;
      const descriptor = previous.descriptor || (native ? { value: native, writable: true, configurable: true, enumerable: true } : undefined);
      guardedCleanup(() => restoreGlobalProperty(window, "mermaid", descriptor), "恢复 Mermaid")();
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

  enhanceCodeBlocks(root: HTMLElement, context) {
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
        onRename: (label: string) => this.editLanguage(label, pre, context, language)
      });
      mountChartAlignment(this, pre, actions);
      const wrap = createEl("button");
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

  async renderMarkdownPreviewBlock(source, element: HTMLElement, context) {
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
    const preview = createDiv();
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

  rememberSource(element: HTMLElement, context) {
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

  editLanguage(label: string, pre, context, current) {
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

  anchorEditedBlock(target: HTMLElement) {
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
  buildBlockHeader(container: HTMLElement, options) {
    const header = createDiv();
    header.className = "ibm-block-header";

    const title = createDiv();
    title.className = "ibm-block-title";
    const icon = createSpan();
    icon.className = "ibm-block-icon";
    if (options.language !== undefined) icon.appendChild(createLanguageIcon(options.language));
    else setIcon(icon, options.withZoom ? UI_ICONS.chart : UI_ICONS.code);
    title.appendChild(icon);

    const label = createEl(options.onRename ? "button" : "span");
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

    const actions = createDiv();
    actions.className = "ibm-block-actions";
    header.appendChild(actions);

    let toolbar = null;
    if (options.withZoom) {
      toolbar = createDiv();
      toolbar.className = "ibm-mermaid-toolbar";
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", t("controls"));
      toolbar.setCssProps({ "--no-tooltip": "true" });
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
  createEditButton(container: HTMLElement) {
    const button = createEl("button");
    button.type = "button";
    button.className = "ibm-edit-source";
    button.title = t("editSource");
    button.setAttribute("aria-label", t("editSource"));
    button.setCssProps({ "--no-tooltip": "true" });
    setIcon(button, UI_ICONS.code);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.editBlock(container);
    });
    return button;
  }

  editBlock(container: HTMLElement) {
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
  storedSourceFor(element: HTMLElement) {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const stored = this.blockSources?.get(node);
      if (stored) return stored;
      if (node.matches(".markdown-preview-section, .markdown-rendered")) break;
    }
    return null;
  }

  createCopyButton(container: HTMLElement) {
    const button = createEl("button");
    button.type = "button";
    button.className = "ibm-copy-source";
    button.title = t("copySource");
    button.setAttribute("aria-label", t("copySource"));
    button.setCssProps({ "--no-tooltip": "true" });
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
  async sourceForBlock(element: HTMLElement) {
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
    this.state.headingNumbers = this.state.headingNumbers === true;
    this.state.lenientBlocks = this.state.lenientBlocks !== false;
    this.state.tableCrosshair = this.state.tableCrosshair === true;
    this.state.autoFoldCode = this.state.autoFoldCode === true;
    this.state.headingNumberStyle = this.state.headingNumberStyle === "chinese" ? "chinese" : "decimal";
    this.state.headingNumberStart = this.state.headingNumberStart === "h1" || this.state.headingNumberStart === "h2" ? this.state.headingNumberStart : "auto";
    this.state.headingNumberDepth = Math.min(6, Math.max(1, Math.round(Number(this.state.headingNumberDepth)) || 4));
    this.state.captions = this.state.captions === true;
    this.state.grayDates = typeof this.state.grayDates === "string" ? this.state.grayDates : "";
    this.state.writingModes = Object.assign(writingModeDefaults(), this.state.writingModes || {});
    this.state.fileTools = Object.assign(fileToolsDefaults(), this.state.fileTools || {});
    this.state.webClip = Object.assign({ watchClipboard: false, folder: "", byDomain: false }, this.state.webClip || {});
    this.state.readingTime = Object.assign({ enabled: true }, this.state.readingTime || {});
    // Existing installs have stored data and have already found their way around; only a fresh install gets the hint.
    if (this.state.introShown === undefined) this.state.introShown = Boolean(stored);
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
  storedSizes(path: string, ordinal) {
    const raw = this.state.tables?.[path]?.[ordinal];
    if (!raw) return { cols: [], rows: [] };
    if (Array.isArray(raw)) return { cols: raw, rows: [] };
    return { cols: raw.cols || [], rows: raw.rows || [] };
  }

  storeSizes(path: string, ordinal, sizes) {
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

  enhanceTables(root: HTMLElement, context) {
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

  attachTable(table, path: string, ordinal) {
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
      cols: hold ? hold.map((width: number, index: number) => sizes.cols[index] || width) : sizes.cols,
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
        widths.forEach((width: number, index: number) => { if (!sizes.cols[index]) sizes.cols[index] = width; });
      },
      resize: (axis, index: number, size) => {
        (axis === "col" ? sizes.cols : sizes.rows)[index] = size;
        publish();
      },
      reset: (axis, index: number) => {
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
 * A line holding only [toc] becomes the note's table of contents;
 * Obsidian itself shows the literal text. Headings come from the metadata cache, so
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

export type { IgnoranceBlueMermaidPlugin };
module.exports = IgnoranceBlueMermaidPlugin;
