/* Which enhancements are on for a note, and why one is off. Pure; the DOM side is enhancement-gate.ts. */
export type EnhancementKind = "tables" | "images" | "code" | "charts";

export const ENHANCEMENTS: { kind: EnhancementKind; label: string; desc: string }[] = [
  { kind: "tables", label: "表格增强", desc: "列宽拖动、排序筛选、合并单元格、复选框、行分组、十字高亮。" },
  { kind: "images", label: "图片增强", desc: "对齐、缩放、裁切、滤镜、点击播放 GIF 的悬停工具条。" },
  { kind: "code", label: "代码块增强", desc: "语言标签、复制按钮、行号与高亮、长代码折叠。" },
  { kind: "charts", label: "图表增强", desc: "Mermaid 与 ECharts 图表的缩放、平移和适配外框。" }
];

/** The cssclass that turns one kind off for a single note. */
export const noteOffClass = (kind: EnhancementKind) => `ib-no-${kind}`;

/** Selectors for blocks another plugin has already dressed; wrapping them again stacks two sets of buttons. */
export const THIRD_PARTY: Record<EnhancementKind, string> = {
  code: ".code-styler-pre, .code-styler-pre-parent, pre[class*='code-styler']",
  tables: ".dataview.table-view-table, .bases-table, .bases-table-container",
  images: ".excalidraw-svg, .excalidraw-embed",
  charts: ""
};

export type EnhancementReason = "setting" | "note" | "third-party" | null;

/** Why a kind is off, or null when it is on. A note's own class wins over nothing: off is off from either source. */
export function enhancementOffReason(options: { settingOn: boolean; noteClasses: string[]; kind: EnhancementKind; handledByOther?: boolean }): EnhancementReason {
  if (!options.settingOn) return "setting";
  if (options.noteClasses.includes(noteOffClass(options.kind))) return "note";
  return options.handledByOther ? "third-party" : null;
}

export const REASON_TEXT: Record<Exclude<EnhancementReason, null>, string> = {
  setting: "已在设置里关闭",
  note: "本篇笔记已关闭（cssclasses 里有 ib-no-…）",
  "third-party": "已有其他插件处理，这里不再叠加"
};

/** A cssclasses / cssclass property value as a flat list of class names. */
export function classNames(frontmatter: unknown): string[] {
  const record: Record<string, unknown> = typeof frontmatter === "object" && frontmatter !== null ? frontmatter as Record<string, unknown> : {};
  return [record.cssclasses, record.cssclass].flat().filter((item): item is string => typeof item === "string")
    .flatMap(item => item.split(/[\s,]+/)).filter(Boolean);
}
