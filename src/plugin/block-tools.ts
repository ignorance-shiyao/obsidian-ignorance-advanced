import { Component,MarkdownRenderer,MarkdownView,Notice } from "obsidian";
import { chartAlignment,mountChartAlignment } from "../modules/chart-alignment.js";
import { fencedCodeContent,parseHighlightedCodeLines,wrapCodeLines } from "../modules/code-lines.js";
import { showCopyFeedback } from "../modules/copy-feedback";
import { createLanguageIcon } from "../modules/language-icons.js";
import { openLanguagePicker,withFenceLanguage } from "../modules/language-picker.js";
import { lineAt } from "../modules/line-index.js";
import { languageLabel,languageOf,t } from "../modules/mermaid-core.js";
import { anchorBlockTop } from "../modules/quiet-edit.js";
import { UI_ICONS,setIcon } from "../modules/ui-icons.js";
import type { IgnorancePlugin } from "../plugin-types.js";

/* Block tools: the header on rendered code / diagram / chart blocks (language, copy, edit), and finding a block's source in the note. */

export function enhanceCodeBlocks(plugin: IgnorancePlugin, root: HTMLElement, context) {
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
    plugin.rememberSource(pre, context);
    const { header, actions } = plugin.buildBlockHeader(pre, {
      label: languageLabel(language),
      language,
      withZoom: false,
      withEdit: false,
      onRename: (label: string) => plugin.editLanguage(label, pre, context, language)
    });
    mountChartAlignment(plugin, pre, actions);
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

export async function renderMarkdownPreviewBlock(plugin: IgnorancePlugin, source: string, element: HTMLElement, context) {
  plugin.rememberSource(element, context);
  const component = new Component();
  component.load();
  context.addChild(component);

  element.classList.add("ibm-markdown-preview-block");
  const { header } = plugin.buildBlockHeader(element, {
    label: "Markdown",
    withZoom: false,
    withEdit: true
  });
  const preview = createDiv();
  preview.className = "ibm-markdown-preview markdown-rendered";
  element.replaceChildren(header, preview);

  try {
    await MarkdownRenderer.render(plugin.app, source, preview, context.sourcePath || "", component);
  } catch (error) {
    console.error("Ignorance Advanced: Markdown code block preview failed —", error);
    const code = preview.createEl("pre").createEl("code", { cls: "language-markdown" });
    code.textContent = source;
  }
}

export function rememberSource(plugin: IgnorancePlugin, element: HTMLElement, context) {
  const info = context?.getSectionInfo?.(element);
  if (!info || !context?.sourcePath) return;
  if (!plugin.blockSources) plugin.blockSources = new WeakMap();
  const fence = info.text.split("\n")[info.lineStart] || "";
  if (/^\s*(?:`{3,}|~{3,})/.test(fence)) element.dataset.ibChartAlign = chartAlignment(fence);
  plugin.blockSources.set(element, {
    path: context.sourcePath,
    lineStart: info.lineStart,
    lineEnd: info.lineEnd
  });
}

export function editLanguage(plugin: IgnorancePlugin, label: string, pre, context, current: string) {
  openLanguagePicker({
    anchor: label,
    current,
    onPick: async language => {
      if (language.toLowerCase() === current.toLowerCase()) return;
      await plugin.writeFenceLanguage(pre, context, language);
    }
  });
}

export async function writeFenceLanguage(plugin: IgnorancePlugin, pre, context, language: string) {
  const info = context?.getSectionInfo?.(pre);
  const file = context?.sourcePath
    ? plugin.app.vault.getAbstractFileByPath(context.sourcePath)
    : null;
  if (!info || !file) return false;

  const rewrite = (data: string) => {
    const lines = data.split("\n");
    const fence = lines[info.lineStart];
    if (!/^\s*(?:`{3,}|~{3,})/.test(fence)) return data;
    lines[info.lineStart] = withFenceLanguage(fence, language);
    return lines.join("\n");
  };

  await plugin.app.vault.process(file, rewrite);
  return true;
}

/* Obsidian's edit-block button selects the whole block. Collapse that to a
   caret at the start of the block's first line — for diagrams and for code
   blocks alike. */
export function collapseSelectionAfterEdit(plugin: IgnorancePlugin) {
  const BLOCKS = ".cm-embed-block, .cm-html-embed, .cm-callout, [class*=\"ibc-container\"]";
  const handler = event => {
    if (!event.target.closest?.(".edit-block-button, .ibm-edit-source")) return;
    plugin.anchorEditedBlock(event.target);
    window.setTimeout(() => {
      const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = view?.editor;
      if (!editor || !editor.somethingSelected()) return;
      editor.setCursor(editor.getCursor("from"));
    }, 0);
  };
  // A plain click on a rendered block can also reveal its source; hold the page still then too.
  const press = event => {
    const block = event.target instanceof Element ? event.target.closest(BLOCKS) : null;
    if (block && !event.target.closest(".edit-block-button, .ibm-edit-source")) plugin.anchorEditedBlock(block);
  };
  document.addEventListener("click", handler, true);
  document.addEventListener("mousedown", press, true);
  plugin.register(() => { document.removeEventListener("click", handler, true); document.removeEventListener("mousedown", press, true); });
}

export function anchorEditedBlock(plugin: IgnorancePlugin, target: HTMLElement) {
  const block = target.closest?.(".cm-embed-block, .cm-html-embed, .cm-callout, [class*=\"ibc-container\"]");
  if (!block) return;
  const cm = plugin.app.workspace.getLeavesOfType("markdown").map(leaf => leaf.view?.editor?.cm).find(cm => cm?.dom.contains(block));
  if (cm) anchorBlockTop(cm, block);
}

/* Obsidian's edit-block button is absolutely positioned against the outer
   block wrapper, which is wider than our container — reserving space for it
   inside the header could never line the two up. Move it into the header
   instead, so the controls stay one group. It is created lazily, so retry. */
/* One header for both block kinds. The only difference is whether the zoom
   group is present, so the slots — label, zoom, copy, edit — are always laid
   out the same way and nothing shifts between a diagram and a code block. */
export function buildBlockHeader(plugin: IgnorancePlugin, container: HTMLElement, options) {
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

  if (options.withZoom) mountChartAlignment(plugin, container, actions);
  actions.appendChild(plugin.createCopyButton(container));
  // Code blocks are edited through Obsidian itself; only diagrams get the button.
  if (options.withEdit !== false) actions.appendChild(plugin.createEditButton(container));
  return { header, actions, toolbar, label };
}

/* Our own edit button. Obsidian's is created lazily, parented to a wrapper we
   do not own and replaced on re-render — moving it around is what made the
   header lose buttons. Ours stays put and simply presses Obsidian's. */
export function createEditButton(plugin: IgnorancePlugin, container: HTMLElement) {
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
    plugin.editBlock(container);
  });
  return button;
}

export function editBlock(plugin: IgnorancePlugin, container: HTMLElement) {
  const host = container.closest(".cm-embed-block, .cm-preview-code-block, .el-pre, .el-div");
  const native = host?.querySelector(".edit-block-button");
  if (native) {
    native.click();
    return;
  }
  // Reading view has no in-place editing of its own: open the note in Live
  // Preview with the caret inside this block, so Obsidian's editor reveals
  // just this block's source while everything else stays rendered.
  const stored = plugin.storedSourceFor(container);
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
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
export function storedSourceFor(plugin: IgnorancePlugin, element: HTMLElement) {
  for (let node = element; node && node !== document.body; node = node.parentElement) {
    const stored = plugin.blockSources?.get(node);
    if (stored) return stored;
    if (node.matches(".markdown-preview-section, .markdown-rendered")) break;
  }
  return null;
}

export function createCopyButton(plugin: IgnorancePlugin, container: HTMLElement) {
  const button = createEl("button");
  button.type = "button";
  button.className = "ibm-copy-source";
  button.title = t("copySource");
  button.setAttribute("aria-label", t("copySource"));
  button.setCssProps({ "--no-tooltip": "true" });
  setIcon(button, UI_ICONS.copy);
  button.addEventListener("click", async () => {
    const source = await plugin.sourceForBlock(container);
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
export async function sourceForBlock(plugin: IgnorancePlugin, element: HTMLElement) {
  const echartsSource = plugin.echartsSources?.get(element);
  if (echartsSource !== undefined) return echartsSource;
  // A code block carries its own source; no need to go back to the file.
  const code = element.matches?.("pre") ? element.querySelector(":scope > code") : null;
  if (code) return code.textContent;

  const stored = plugin.storedSourceFor(element);
  if (stored) {
    const file = plugin.app.vault.getAbstractFileByPath(stored.path);
    if (file) {
      const text = await plugin.app.vault.cachedRead(file);
      return text.split("\n").slice(stored.lineStart + 1, stored.lineEnd).join("\n");
    }
  }

  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
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

export function sweepBlocks(plugin: IgnorancePlugin) {
  for (const container of document.querySelectorAll(".mermaid")) {
    plugin.enhanceDiagram(container);
  }
}
