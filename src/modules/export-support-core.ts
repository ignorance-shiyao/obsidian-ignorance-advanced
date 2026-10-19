/* What each export format keeps of each kind of content. One table, read by the 导出支持表 dialog and by the
   docs, so the answer to "will my chart survive Word?" is written down once. Statuses:
     full     kept as it is on screen
     image    kept, as a picture or a vector graphic (no longer editable as that kind of block)
     partial  kept with a limit, which `note` states
     none     left out, or kept only as its source text
   Every entry is backed by what the exporter does (and what the export check already warns about). */
export type ExportFormatId = "html" | "word" | "pdf" | "pptx" | "epub";
export type SupportLevel = "full" | "image" | "partial" | "none";
export interface SupportCell { level: SupportLevel; note?: string }
export interface SupportRow { block: string; cells: Record<ExportFormatId, SupportCell> }

export const FORMAT_LABELS: Record<ExportFormatId, string> = { html: "HTML", word: "Word", pdf: "PDF / 分页", pptx: "PPTX", epub: "电子书 EPUB" };
export const FORMAT_ORDER: ExportFormatId[] = ["html", "word", "pdf", "pptx", "epub"];
export const LEVEL_LABELS: Record<SupportLevel, string> = { full: "完整", image: "转为图片/矢量图", partial: "有限制", none: "不含" };

const FULL: SupportCell = { level: "full" };
const REMOTE: SupportCell = { level: "partial", note: "导出时才下载，离线或链接失效会缺图" };

export const SUPPORT_ROWS: SupportRow[] = [
  { block: "表格", cells: { html: FULL, word: FULL, pdf: FULL, pptx: { level: "full", note: "成为可编辑的 PowerPoint 表格" }, epub: FULL } },
  { block: "本地图片", cells: { html: FULL, word: FULL, pdf: FULL, pptx: FULL, epub: { level: "full", note: "同一张图只存一份" } } },
  { block: "网络图片", cells: { html: REMOTE, word: REMOTE, pdf: REMOTE, pptx: REMOTE, epub: { level: "none", note: "不收入，结束时会计数提示" } } },
  { block: "Mermaid 图表", cells: { html: FULL, word: { level: "image", note: "转成图片；渲染失败时留下源码" }, pdf: FULL, pptx: { level: "image", note: "矢量图放入幻灯片" }, epub: { level: "image", note: "以矢量图收入" } } },
  { block: "ECharts 图表", cells: { html: FULL, word: { level: "none", note: "只留下 echarts 源码" }, pdf: FULL, pptx: { level: "image", note: "矢量图放入幻灯片" }, epub: { level: "image", note: "以矢量图收入；没画出来的图表会计数提示" } } },
  { block: "代码块", cells: { html: FULL, word: FULL, pdf: FULL, pptx: { level: "full", note: "成为可编辑的文本块" }, epub: FULL } },
  { block: "Dataview / Tasks / Bases 动态块", cells: { html: { level: "partial", note: "只导出阅读视图当时的结果" }, word: { level: "none", note: "当作普通代码，不含查询结果" }, pdf: { level: "partial", note: "只导出阅读视图当时的结果" }, pptx: { level: "partial", note: "只导出阅读视图当时的结果" }, epub: { level: "partial", note: "只导出渲染当时的结果" } } }
];

/** Rows that have a problem (anything but "full") for one format, for a short summary. */
export function limitsFor(format: ExportFormatId, rows: SupportRow[] = SUPPORT_ROWS): { block: string; cell: SupportCell }[] {
  return rows.filter(row => row.cells[format].level !== "full").map(row => ({ block: row.block, cell: row.cells[format] }));
}
