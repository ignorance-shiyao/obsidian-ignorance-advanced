import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { SuggestModal, Notice, MarkdownView } from "obsidian";
/* 导航: one searchable list of everything worth jumping to in the current note — headings, figures, tables,
   code blocks and diagrams — so a long note can be crossed without scrolling. Read-only. */
import { parseCaptions } from "./captions.js";

export const NAV_ICONS = { heading: "#", figure: "▣", table: "▦", code: "‹›", diagram: "◈" } as const;

export interface NavItem { kind: "heading" | "figure" | "table" | "code" | "diagram"; label: string; line: number; level?: number }

const DIAGRAM_LANGUAGES = new Set(["mermaid", "echarts", "chart", "plantuml"]);
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/** Pure: build the list from a note's source lines and Obsidian's heading list. */
export function buildNavItems(source: string, headings: Array<{ text: string; level: number; line: number }>): NavItem[] {
  const lines = source.split(/\r?\n/);
  const items: NavItem[] = headings.map(heading => ({ kind: "heading", label: heading.text, line: heading.line, level: heading.level }));
  const captions = new Map(parseCaptions(source).map(entry => [entry.line, entry]));
  let fence = "", fenceLanguage = "", fenceStart = 0;
  let tableCount = 0;
  let lastTable: NavItem | null = null;
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/.exec(line);
    if (marker) {
      if (!fence) { fence = marker[1]; fenceLanguage = (marker[2] || "").toLowerCase(); fenceStart = index; }
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.replace(marker[1], "").trim()) {
        const diagram = DIAGRAM_LANGUAGES.has(fenceLanguage);
        items.push({ kind: diagram ? "diagram" : "code", label: diagram ? `图表 ${fenceLanguage}` : `代码 ${fenceLanguage || "text"}`, line: fenceStart });
        fence = "";
      }
      return;
    }
    if (fence) return;
    const caption = captions.get(index);
    if (caption) {
      const label = `${caption.label} ${caption.text}`;
      if (caption.kind === "fig") { items.push({ kind: "figure", label, line: index }); }
      else if (caption.kind === "tab" && lastTable) lastTable.label = label; // the caption line names the table above it
      return;
    }
    const image = /!\[\[([^\]|]+)|!\[[^\]]*\]\(([^)]+)\)/.exec(line);
    if (image && IMAGE_EXTENSION.test((image[1] || image[2] || "").split("?")[0])) {
      items.push({ kind: "figure", label: `图片 ${(image[1] || image[2]).split("/").pop()}`, line: index });
      return;
    }
    if (/^\s*\|/.test(line) && !(index > 0 && /^\s*\|/.test(lines[index - 1]))) {
      tableCount += 1;
      lastTable = { kind: "table", label: `表格 ${tableCount}`, line: index };
      items.push(lastTable);
    }
  });
  return items.sort((a, b) => a.line - b.line);
}

export function openNavigation(plugin: IgnorancePlugin) {
  const { app } = plugin;
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) { new Notice(tr("请先打开一篇笔记")); return; }
  const file = view.file;
  const cache = app.metadataCache.getFileCache(file) || {};
  const headings = (cache.headings || []).map(item => ({ text: item.heading, level: item.level, line: item.position.start.line }));
  const text = view.getMode?.() === "source" && view.editor ? view.editor.getValue() : null;
  void (text !== null ? Promise.resolve(text) : app.vault.cachedRead(file)).then(source => {
    const items = buildNavItems(source, headings);
    if (!items.length) { new Notice(tr("这篇笔记里没有可跳转的内容")); return; }
    const ICON = NAV_ICONS;
    class NavigationModal extends SuggestModal<NavItem> {
      getSuggestions(query: string) {
        const needle = query.trim().toLowerCase();
        return needle ? items.filter(item => item.label.toLowerCase().includes(needle) || ICON[item.kind] === needle) : items;
      }
      renderSuggestion(item: NavItem, el: HTMLElement) {
        el.addClass("ib-nav-item");
        el.createSpan({ cls: "ib-nav-item__icon", text: ICON[item.kind] });
        el.createSpan({ cls: "ib-nav-item__label", text: item.label }).style.setProperty("--ib-nav-indent", `${Math.max(0, (item.level || 1) - 1)}em`);
        el.createSpan({ cls: "ib-nav-item__line", text: `第 ${item.line + 1} 行` });
      }
      onChooseSuggestion(item: NavItem) { view.setEphemeralState({ line: item.line }); }
    }
    const modal = new NavigationModal(app);
    modal.setPlaceholder(tr("搜索标题、图表、表格、代码…"));
    modal.open();
  });
}
