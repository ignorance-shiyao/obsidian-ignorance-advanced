import type { Editor, TAbstractFile } from "obsidian";
import { MarkdownView,Notice,Platform,TFile,View } from "obsidian";
import { createAfterPaintQueue } from "../modules/after-paint-queue.js";
import { applyAppearancePreferences,clearAppearancePreferences,installAppearanceControls } from "../modules/appearance.js";
import { BlockHeightMemory } from "../modules/block-height-memory.js";
import { installCalloutMotion } from "../modules/callout-motion";
import { captionsEditorExtension } from "../modules/captions-editor.js";
import { installCaptions } from "../modules/captions.js";
import { installChartPreload } from "../modules/chart-preload.js";
import { installCodeFold } from "../modules/code-fold.js";
import { colorSwatchExtension,colorSwatchPostProcessor } from "../modules/color-swatch.js";
import { containerEditorExtension } from "../modules/container-editor.js";
import { renderContainerBlocks } from "../modules/containers.js";
import { clearContextMarkers,markContext } from "../modules/context-markers.js";
import { openTaskExamples } from "../modules/task-examples.js";
import { installEditorMenu } from "../modules/editor-menu.js";
import { showActiveEnhancements } from "../modules/enhancement-gate.js";
import { renderEChartsBlock } from "../modules/echarts-renderer.js";
import { echartsSourceHighlighter } from "../modules/echarts-source.js";
import { TableSizeStyles,codeCopyButtons,installCodeLanguagePicker,installQuietTaskToggle,mermaidHighlighter,tableKey,toggleWritingMode,writingModesExtension } from "../modules/editor-tools.js";
import * as ExportTools from "../modules/export.js";
import { copyFormattedNote,exportImages,exportPdf,exportWord,openExportMenu,prepareRichCopyMarkup } from "../modules/export.js";
import { installFileIcons } from "../modules/file-icons.js";
import { HTML_READONLY_VIEW,HtmlReadOnlyView,MarkdownImportModal,addFileToolsMenu,handleImageTransfer,importVaultFileAsMarkdown,isMarkdownImportSource } from "../modules/file-tools.js";
import { installGifClick } from "../modules/gif-click.js";
import { installGrayMode } from "../modules/gray-mode.js";
import { installHeaderPath } from "../modules/header-path.js";
import { headingNumbersEditorExtension } from "../modules/heading-numbers-editor.js";
import { installHeadingNumbers } from "../modules/heading-numbers.js";
import { exportHtml,prepareHtmlDocument } from "../modules/html-export.js";
import { installImageAlignment } from "../modules/image-align.js";
import { inlineSyntaxEditorExtension } from "../modules/inline-syntax-editor.js";
import { renderInlineSyntax } from "../modules/inline-syntax.js";
import { setLanguageIconHost } from "../modules/language-icons.js";
import { openLinkCheck } from "../modules/link-check.js";
import { clearPaint,t } from "../modules/mermaid-core.js";
import { addLenientCommand,installLenientBlocks,lenientBlocksEditorExtension } from "../modules/missing-blank-lines.js";
import { installMoreMenuFilter } from "../modules/more-menu.js";
import { installNativeChapterSource } from "../modules/native-chapter-source.js";
import { NAVIGATION_VIEW,createNavigationView,openNavigationView } from "../modules/navigation-view.js";
import { openNavigation } from "../modules/navigation.js";
import * as PageControls from "../modules/page-controls.js";
import { handleEnhancedPaste } from "../modules/paste-enhance.js";
import { installPageControls,setPageRefreshHandler } from "../modules/page-controls.js";
import { guardedCleanup } from "../modules/plugin-cleanup.js";
import { installPreviewOverscan } from "../modules/preview-overscan.js";
import { quoteIndentExtension } from "../modules/quote-indent.js";
import { installReadingCover } from "../modules/reading-cover.js";
import { refreshBooks } from "../modules/reading-pagination.js";
import { installReadingPosition } from "../modules/reading-position.js";
import { installReadingTime } from "../modules/reading-time.js";
import { IgnoranceSettingTab,installTabOpening } from "../modules/settings.js";
import { exportNotePptx,installPresentationMode,openPresentation } from "../modules/slides.js";
import { smartPunctuationExtension } from "../modules/smart-punctuation.js";
import { SNIPPET_TEMPLATES, buildSnippetInsertion } from "../modules/snippets.js";
import { openSyntaxGuide,showFirstRunHint } from "../modules/syntax-guide.js";
import { syncPreviewTableAlignment } from "../modules/table-alignment.js";
import { installTableCrosshair } from "../modules/table-crosshair.js";
import { TABLE_COMMANDS,applyTableEdit,canEditTable,tableEditorExtension } from "../modules/table-editor.js";
import { installTableExtras } from "../modules/table-merge.js";
import { installTableSort } from "../modules/table-sort.js";
import { renderTocBlocks,tocExtension } from "../modules/toc.js";
import { installWebClip } from "../modules/web-clip.js";
import { wrapSelectionExtension } from "../modules/wrap-selection.js";
import type { IgnorancePlugin, TableLayer } from "../plugin-types.js";
import { releaseTableLayers } from "./table-sizes.js";

function insertSnippet(editor: Editor, snippet: (typeof SNIPPET_TEMPLATES)[number]) {
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

/* Plugin lifecycle: everything onload wires up (state, renderers, editor extensions, commands, views, observers) and what onunload undoes. */

export async function onload(plugin: IgnorancePlugin) {
  plugin.measuredBounds = new WeakMap();
  plugin.fileTools = Object.freeze({
    isMarkdownImportSource,
    importVaultFileAsMarkdown: (file: TFile, noteName: string) => importVaultFileAsMarkdown(plugin, file, noteName)
  });
  plugin.diagramStates = new WeakMap();
  plugin.diagramEnhancements = createAfterPaintQueue((container: HTMLElement) => plugin.enhanceDiagram(container));
  plugin.register(() => plugin.diagramEnhancements.clear());
  setPageRefreshHandler(refreshBooks);
  plugin.registerEditorExtension(mermaidHighlighter);
  // [toc]: a table of contents in reading view, exports and the editor.
  plugin.registerEditorExtension(tocExtension(plugin));
  // Render Markdown ::: containers while the cursor is outside their source.
  plugin.registerEditorExtension(containerEditorExtension(plugin));
  plugin.registerEditorExtension(inlineSyntaxEditorExtension(plugin));
  plugin.registerEditorExtension(headingNumbersEditorExtension(plugin));
  plugin.registerEditorExtension(lenientBlocksEditorExtension(plugin));
  addLenientCommand(plugin);
  plugin.registerEditorExtension(captionsEditorExtension(plugin));
  plugin.registerEditorExtension(quoteIndentExtension);
  // Paged view in the editor: push blocks that would cross a page bottom.
  // Format Markdown tables and provide cell/row keyboard navigation.
  plugin.registerEditorExtension(tableEditorExtension);
  // Marker keys wrap the current non-empty selection.
  plugin.registerEditorExtension(wrapSelectionExtension);
  plugin.registerEditorExtension(colorSwatchExtension);
  plugin.registerEditorExtension(smartPunctuationExtension(plugin));
  plugin.registerMarkdownPostProcessor((element, context) => renderTocBlocks(plugin, element, context.sourcePath));
  plugin.registerMarkdownPostProcessor((element, context) => renderContainerBlocks(plugin, element, context));
  plugin.registerMarkdownPostProcessor(element => renderInlineSyntax(plugin, element));
  plugin.registerMarkdownPostProcessor(element => colorSwatchPostProcessor(element));
  installHeadingNumbers(plugin);
  installLenientBlocks(plugin);
  installTableExtras(plugin);
  installCaptions(plugin);
  installReadingCover(plugin);
  installGifClick(plugin);
  installTableCrosshair(plugin);
  installTableSort(plugin);
  installEditorMenu(plugin);
  installNativeChapterSource(plugin);
  installCodeFold(plugin);
  // Warming every diagram in the open note loads the 1 MB ECharts and 5 MB Mermaid engines in the
  // background; on a phone that competes with startup, so diagrams are drawn when they are reached.
  if (!Platform.isMobile) installChartPreload(plugin);
  installPreviewOverscan(plugin);
  plugin.registerEditorExtension(echartsSourceHighlighter);
  plugin.registerMarkdownCodeBlockProcessor("echarts", (source, element, context) => renderEChartsBlock(plugin, source, element, context));
  for (const language of ["markdown", "md"]) {
    plugin.registerMarkdownCodeBlockProcessor(language, (source, element, context) =>
      plugin.renderMarkdownPreviewBlock(source, element, context));
  }
  plugin.registerEditorExtension(codeCopyButtons);
  installQuietTaskToggle(plugin);
  installCodeLanguagePicker(plugin);
  plugin.registerEditorExtension(writingModesExtension(plugin));

  // Claim the Mermaid global before anything renders, but load the 5 MB
  // engine only when a diagram actually needs it.
  plugin.installLazyMermaid();
  setLanguageIconHost(plugin);
  installFileIcons(plugin);
  plugin.heightMemory = new BlockHeightMemory(plugin.app, "ignorance-advanced-block-heights");
  plugin.register(() => plugin.heightMemory.dispose());

  await plugin.loadStoredState();
  installPresentationMode(plugin);
  plugin.registerView(HTML_READONLY_VIEW, leaf => new HtmlReadOnlyView(leaf));
  plugin.registerExtensions(["html", "htm"], HTML_READONLY_VIEW);
  plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, file) => addFileToolsMenu(plugin, menu, file)));
  installCalloutMotion(plugin);
  installImageAlignment(plugin);
  installReadingPosition(plugin);
  installHeaderPath(plugin);
  installWebClip(plugin);
  installReadingTime(plugin);
  installGrayMode(plugin);
  installMoreMenuFilter(plugin);
  // Mobile has no title-row toolbar (phones) or no Electron exports: offer
  // slides and the exports that work there from the note's "⋯" menu.
  if (Platform.isMobile) {
    plugin.registerEvent(plugin.app.workspace.on("file-menu", (menu, file, source) => {
      if (source !== "more-options" || !(file instanceof TFile) || file.extension !== "md") return;
      // Phones have no outline pane beside the note; the jump list (headings, diagrams, tables, code) stands in.
      if (Platform.isPhone) menu.addItem(item => item.setTitle("跳到标题、图表或表格").setIcon("lucide-list-tree").setSection("ibp-export").onClick(() => openNavigation(plugin)));
      menu.addItem(item => item.setTitle("演示").setIcon("lucide-presentation").setSection("ibp-export").onClick(() => { void openPresentation(plugin, file); }));
      ExportTools.addPortableExportItems(plugin, menu, file);
    }));
  }
  plugin.registerEvent(plugin.app.workspace.on("editor-paste", (event, editor, info) => handleImageTransfer(plugin, event, editor, info, "paste")));
  plugin.registerEvent(plugin.app.workspace.on("editor-paste", (event, editor) => handleEnhancedPaste(plugin, event, editor)));
  plugin.registerEvent(plugin.app.workspace.on("editor-drop", (event, editor, info) => handleImageTransfer(plugin, event, editor, info, "drop")));
  plugin.addSettingTab(new IgnoranceSettingTab(plugin.app, plugin));
  plugin.register(() => clearAppearancePreferences());
  plugin.register(() => document.body.classList.remove("ib-show-code-line-numbers"));
  plugin.tableStyles = new TableSizeStyles();
  plugin.tableLayers = new Set();
  plugin.register(() => {
    plugin.tableStyles.destroy();
    releaseTableLayers(plugin);
    document.querySelectorAll<HTMLElement>("table.ibt-enhanced").forEach(table => {
      table.classList.remove("ibt-enhanced");
      delete table.dataset.ibtKey;
    });
  });

  plugin.registerMarkdownPostProcessor((element, context) => {
    if (element.querySelector("pre > code")) plugin.rememberSource(element, context);
    plugin.enhanceCodeBlocks(element, context);
    plugin.enhanceTables(element, context);
    window.requestAnimationFrame(() => { plugin.enhanceCodeBlocks(element, context); plugin.enhanceAll(element); });
    window.setTimeout(() => { plugin.enhanceCodeBlocks(element, context); plugin.enhanceAll(element); }, 250);
  });

  plugin.observer = new MutationObserver(mutations => {
    // Gather first, then enhance once: a render adds many nodes per batch.
    const diagrams = new Set<Element>();
    const removedDiagrams = new Set<Element>();
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
        const tables = node.matches(".cm-table-widget table") && node.instanceOf(HTMLTableElement) ? [node] : [...node.querySelectorAll<HTMLTableElement>(".cm-table-widget table")];
        for (const table of tables) plugin.enhanceLiveTable(table);
        // …and the container is then an ancestor, not this node or below it.
        const owner = node.parentElement?.closest?.(".mermaid");
        if (owner) diagrams.add(owner);
      }
    }
    for (const diagram of removedDiagrams) { if (diagram.instanceOf(HTMLElement) && !diagram.isConnected) plugin.disposeDiagram(diagram); }
    if (diagrams.size) plugin.enhanceDiagrams([...diagrams].filter((diagram): diagram is HTMLElement => diagram.instanceOf(HTMLElement)));
  });
  plugin.observer.observe(document.body, { childList: true, subtree: true });
  plugin.register(() => plugin.observer.disconnect());
  markContext(document.body);
  plugin.register(() => clearContextMarkers());
  // While the "title" property is being edited, Obsidian's value suggestions would cover the title field.
  const syncTitleFocus = () => document.body.classList.toggle("ib-title-property-focus",
    Boolean(document.activeElement?.closest('.metadata-property[data-property-key="title" i]')));
  plugin.registerDomEvent(document, "focusin", syncTitleFocus);
  plugin.registerDomEvent(document, "focusout", () => window.setTimeout(syncTitleFocus, 0));
  plugin.register(() => document.body.classList.remove("ib-title-property-focus"));

  // A sweep on layout changes catches any diagram the observer missed.
  // Reading view renders a moment after the mode switch or the save, so look again a few times.
  const syncTablePositions = (file?: TAbstractFile) => [150, 700, 1800].forEach(delay => window.setTimeout(() => {
    for (const leaf of plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || (file && view.file?.path !== file.path)) continue;
      void syncPreviewTableAlignment(plugin, view).catch(() => {});
    }
  }, delay));
  plugin.registerEvent(plugin.app.workspace.on("layout-change", () => { markContext(document.body); plugin.sweepBlocks(); syncTablePositions(); }));
  plugin.registerEvent(plugin.app.vault.on("modify", file => syncTablePositions(file)));
  // Paged books key their [toc] on the cached headings; re-check them when the cache updates.
  plugin.registerEvent(plugin.app.metadataCache.on("changed", () => { if (plugin.state.page.paged) refreshBooks(plugin, false); }));
  plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", () => {
    plugin.sweepBlocks();
    refreshBooks(plugin, false);
  }));


  // Page toolbar above every note: width, zoom, paper pages, page numbers.
  // Phones: no page toolbar or paging (the screen is the page).
  if (!Platform.isPhone) plugin.app.workspace.onLayoutReady(() => installPageControls(plugin, openExportMenu));
  // Exports still need paper and margin settings there.
  else plugin.app.workspace.onLayoutReady(() => PageControls.initPageState(plugin));
  plugin.exporters = { pdf: exportPdf, word: exportWord, images: exportImages, richCopy: prepareRichCopyMarkup, copyFormatted: copyFormattedNote, html: prepareHtmlDocument, exportHtml, pptx: exportNotePptx };

  // Default new-tab behavior is applied at the Workspace API boundary.
  plugin.app.workspace.onLayoutReady(() => { installTabOpening(plugin); showFirstRunHint(plugin); });

  // Desktop profile controls and mobile ribbon / note-menu controls share
  // the same theme preferences and switching behavior.
  plugin.app.workspace.onLayoutReady(() => installAppearanceControls(plugin));

  // Obsidian toggles theme-dark on <body>; repaint rather than re-render.
  plugin.themeObserver = new MutationObserver(() => {
    applyAppearancePreferences(plugin);
    plugin.repaintAll();
  });
  const onThemeChange = () => plugin.repaintAll(true);
  window.addEventListener("ib-theme-change", onThemeChange);
  plugin.register(() => window.removeEventListener("ib-theme-change", onThemeChange));
  plugin.themeObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  plugin.register(() => plugin.themeObserver.disconnect());

  plugin.collapseSelectionAfterEdit();

  plugin.addCommand({
    id: "task-examples",
    name: "新建任务式示例",
    callback: () => openTaskExamples(plugin)
  });

  plugin.addCommand({
    id: "active-enhancements",
    name: "当前笔记生效的增强",
    callback: () => showActiveEnhancements(plugin, plugin.app.workspace.getActiveViewOfType(MarkdownView))
  });

  plugin.addCommand({
    id: "cycle-table-density",
    name: t("densityCommand"),
    callback: () => plugin.cycleDensity()
  });

  plugin.addCommand({
    id: "reset-table-widths",
    name: t("resetWidthsCommand"),
    callback: () => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const path = view?.file?.path;
      if (!path) return;
      const count = Object.keys(plugin.state.tables[path] || {}).length;
      delete plugin.state.tables[path];
      plugin.saveStoredState();
      // Clear in place: attached tables hold these same arrays, and a later
      // drag would otherwise write the old sizes straight back.
      for (let ordinal = 0; ordinal < Math.max(count, 64); ordinal += 1) {
        const entry = plugin.tableStyles.sizes.get(tableKey(path, ordinal));
        if (entry) { entry.sizes.cols.length = 0; entry.sizes.rows.length = 0; }
      }
      plugin.tableStyles.render();
      for (const layer of plugin.tableLayers) {
        const buildable = layer as TableLayer & { built?: boolean; build?: () => void };
        if (buildable.built) buildable.build?.();
      }
      new Notice(t("widthsReset"));
    }
  });

  for (const command of TABLE_COMMANDS) {
    plugin.addCommand({
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
    plugin.addCommand({
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

  plugin.addCommand({
    id: "toggle-typewriter-scroll",
    name: "切换打字机滚动",
    callback: () => toggleWritingMode(plugin, "typewriterScroll")
  });

  plugin.addCommand({
    id: "toggle-writing-focus",
    name: "切换专注模式",
    callback: () => toggleWritingMode(plugin, "focusMode")
  });

  if (!Platform.isMobile) {
    plugin.addCommand({
      id: "import-docx-markdown",
      name: "导入当前文件为 Markdown",
      callback: () => {
        const file = plugin.app.workspace.getActiveFile();
        if (!isMarkdownImportSource(file)) {
          new Notice("请先打开或选中支持导入的本地文件（如文字文档（.docx）、电子表格（.xlsx）、演示文稿（.pptx）、PDF、CSV、JSON、HTML）");
          return;
        }
        new MarkdownImportModal(plugin, file).open();
      }
    });
  }

  plugin.registerView(NAVIGATION_VIEW, leaf => new (createNavigationView(plugin))(leaf));
  plugin.addCommand({
    id: "open-navigation-view",
    name: "在侧栏打开导航",
    callback: () => void openNavigationView(plugin)
  });

  plugin.addCommand({
    id: "note-navigation",
    name: "跳到标题、图表、表格或代码",
    callback: () => openNavigation(plugin)
  });

  plugin.addCommand({
    id: "check-note-links",
    name: "检查当前笔记的链接和标题",
    callback: () => openLinkCheck(plugin)
  });

  plugin.addCommand({
    id: "open-syntax-guide",
    name: "打开语法速查",
    callback: () => void openSyntaxGuide(plugin)
  });

  plugin.addCommand({
    id: "reset-active-mermaid-view",
    name: t("resetCommand"),
    callback: () => {
      const container = plugin.app.workspace.getActiveViewOfType(View)?.containerEl;
      if (!container) return;
      container.querySelectorAll<HTMLElement>(".mermaid.ibm-mermaid-enhanced").forEach(element => {
        const state = plugin.diagramStates.get(element);
        if (state) plugin.fitDiagram(element, state);
      });
    }
  });
}

export function onunload(plugin: IgnorancePlugin) {
  document.querySelectorAll("pre.ibc-enhanced").forEach(pre => {
    guardedCleanup(() => {
    pre.querySelector(":scope > .ibm-block-header")?.remove();
    pre.classList.remove("ibc-enhanced", "ib-code-soft-wrap");
    }, "代码块清理")();
  });

  document.querySelectorAll<HTMLElement>(".mermaid.ibm-mermaid-enhanced").forEach(element => {
    guardedCleanup(() => {
    const state = plugin.diagramStates.get(element);
    state?.cleanup?.();
    element.classList.remove("ibm-mermaid-enhanced", "is-panning", "is-interactive");
    element.querySelector(":scope > .ibm-block-header")?.remove();
    const svg = element.querySelector<SVGSVGElement>(".ibm-mermaid-canvas > svg, :scope > svg");
    if (svg) {
      clearPaint(svg);
      svg.style.removeProperty("transform");
      svg.style.removeProperty("transform-origin");
    }
    }, "图表清理")();
  });
}
