/* One-click page presets for the page toolbar (reading width, paper, margins, page numbers). Each preset only
   fills in the page settings; everything can still be changed afterwards. */
import { paperMarginsForPreset } from "./paper.js";

export interface PagePreset { id: string; label: string; settings: Record<string, unknown> }

export const PAGE_PRESETS: PagePreset[] = [
  { id: "paper", label: "论文：A4 竖版，适中页边距，页码「1 / N」，页眉显示章节",
    settings: { width: "standard", paged: true, paper: "A4", landscape: false, marginPreset: "moderate", pageNumber: "center", pageNumberFormat: "total", runningHeader: "chapter", breakMode: "whitespace" } },
  { id: "report", label: "汇报：A4 横版，窄页边距，页码靠右",
    settings: { width: "wide", paged: true, paper: "A4", landscape: true, marginPreset: "narrow", pageNumber: "right", pageNumberFormat: "total", runningHeader: "none", breakMode: "whitespace" } },
  { id: "official", label: "公文：A4 竖版，公文页边距，页码「- 1 -」",
    settings: { width: "standard", paged: true, paper: "A4", landscape: false, marginPreset: "gov", pageNumber: "center", pageNumberFormat: "gov", runningHeader: "none", breakMode: "whitespace" } },
  { id: "blog", label: "博客：连续阅读，标准宽度，不显示页码",
    settings: { width: "standard", paged: false, marginPreset: "normal", pageNumber: "none", runningHeader: "none" } }
];

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

/** Fill the page settings from a preset (the margins follow the paper size). Returns false for an unknown id. */
export function applyPagePreset(page: object, id: string): boolean {
  const preset = PAGE_PRESETS.find(item => item.id === id);
  if (!preset) return false;
  Object.assign(page, preset.settings);
  const settings = page as Record<string, unknown>;
  const margins = paperMarginsForPreset(textOf(settings.marginPreset), textOf(settings.paper));
  if (margins) settings.margins = margins;
  return true;
}
