import { tr, zh } from "../i18n.js";
/* One-click page presets for the page toolbar (reading width, paper, margins, page numbers). Each preset only
   fills in the page settings; everything can still be changed afterwards. */
import type { LayoutRecord } from "./layout-library-core.js";

export interface PagePreset { id: string; label: string; settings: Record<string, unknown> }

export const PAGE_PRESETS: PagePreset[] = [
  { id: "paper", label: zh("论文：A4 竖版，适中页边距，页码「1 / N」，页眉显示章节"),
    settings: { width: "standard", paged: true, paper: "A4", landscape: false, marginPreset: "moderate", pageNumber: "center", pageNumberFormat: "total", runningHeader: "chapter", breakMode: "whitespace" } },
  { id: "report", label: zh("汇报：A4 横版，窄页边距，页码靠右"),
    settings: { width: "wide", paged: true, paper: "A4", landscape: true, marginPreset: "narrow", pageNumber: "right", pageNumberFormat: "total", runningHeader: "none", breakMode: "whitespace" } },
  { id: "official", label: zh("公文：A4 竖版，公文页边距，页码「- 1 -」"),
    settings: { width: "standard", paged: true, paper: "A4", landscape: false, marginPreset: "gov", pageNumber: "center", pageNumberFormat: "gov", runningHeader: "none", breakMode: "whitespace" } },
  { id: "blog", label: zh("博客：连续阅读，标准宽度，不显示页码"),
    settings: { width: "standard", paged: false, marginPreset: "normal", pageNumber: "none", runningHeader: "none" } }
];

/** The built-in presets as layouts, so they sit in one list with the user's own. Their ids start with "builtin:";
    the name is the part of the label before the colon, in the interface language. */
export const BUILTIN_PREFIX = "builtin:";
export function builtinLayouts(): LayoutRecord[] {
  return PAGE_PRESETS.map(preset => ({ id: BUILTIN_PREFIX + preset.id, name: tr(preset.label).split(/[：:]/)[0], settings: preset.settings }));
}

/** The Chinese names too, so a note written with `ib-layout: 汇报` keeps working when the interface is English. */
export function builtinAliases(record: LayoutRecord): string[] {
  const preset = PAGE_PRESETS.find(item => BUILTIN_PREFIX + item.id === record.id);
  return preset ? [preset.label.split(/[：:]/)[0], preset.id] : [];
}
