import { TFile } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { buildBook } from "./book-export.js";
import { exportWord, saveExportToVault } from "./export.js";
import { exportHtml } from "./html-export.js";
import { scanExportIssues, type ExportIssue } from "./export-check-core.js";
import { applyLayout, snapshotLayout, type PageLike } from "./layout-library-core.js";
import { savePageSettings } from "./page-controls.js";
import { exportNotePptx } from "./slides.js";
import { createNoteFromTemplate, templateFiles } from "./user-templates.js";
import { WORD_FONT_OPTIONS, normalizeWordFont } from "./word-font.js";
/* The small public interface for QuickAdd, Templater or your own scripts:
     const api = app.plugins.plugins["ignorance-advanced"].api;
     const result = await api.exportNote({ path: "方案/年度计划.md", format: "word", layout: "汇报" });
   Everything is explicit: you name the notes, the layout and the format; nothing opens a dialog or acts on whatever
   happens to be open. Each call returns `{ ok, output, warnings }` (or `{ ok: false, error, warnings }`) and never
   throws. `version` changes only when a call changes incompatibly. */

export type ApiFormat = "word" | "html" | "epub" | "pptx";
export const API_FORMATS: readonly ApiFormat[] = ["word", "html", "epub", "pptx"];

export interface ApiIssue { line: number; level: "warn" | "note"; message: string }
export type ApiResult<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string; warnings: string[] };

export interface ExportOptions {
  /** The note to export (for epub, the first chapter). */
  path: string;
  format: ApiFormat;
  /** Name or id of a saved layout, applied for this export only; the page settings are put back afterwards. */
  layout?: string;
  /** epub only: more notes, in chapter order, after `path`. */
  more?: string[];
  /** epub only: book title (defaults to the first note's name) and author. */
  title?: string;
  author?: string;
}

export interface IgnoranceApi {
  version: 1;
  formats: readonly ApiFormat[];
  listLayouts(): { id: string; name: string }[];
  listTemplates(): string[];
  checkNote(path: string, format?: ApiFormat): Promise<ApiResult<{ issues: ApiIssue[] }>>;
  createNote(options: { template: string; title: string; folder?: string }): Promise<ApiResult<{ path: string; layoutApplied: string | null }>>;
  exportNote(options: ExportOptions): Promise<ApiResult<{ output: string }>>;
}

const failure = (error: unknown, warnings: string[] = []): { ok: false; error: string; warnings: string[] } =>
  ({ ok: false, error: error instanceof Error ? error.message : typeof error === "string" ? error : tr("未知错误"), warnings });

export function createApi(plugin: IgnorancePlugin): IgnoranceApi {
  const { app } = plugin;
  const noteAt = (path: string): TFile => {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md") throw new Error(tr("找不到笔记：{path}", { path }));
    return file;
  };
  const issuesOf = async (file: TFile, kind: string): Promise<ExportIssue[]> => {
    const wordFont = WORD_FONT_OPTIONS.find(([value]) => value === normalizeWordFont(plugin.state.wordFont))?.[1];
    return scanExportIssues(await app.vault.cachedRead(file), {
      kind, wordFont,
      exists: target => Boolean(app.metadataCache.getFirstLinkpathDest(target, file.path) || app.vault.getAbstractFileByPath(target))
    });
  };
  const describe = (issues: ExportIssue[]) => issues.map(issue => `${issue.line ? `${issue.line}: ` : ""}${issue.message}`);

  /** Runs `job` with a saved layout applied, then restores the page settings and Word font exactly as they were. */
  const withLayout = async <T>(name: string | undefined, job: () => Promise<T>): Promise<T> => {
    if (!name) return job();
    const record = (plugin.state.layouts ?? []).find(item => item.name === name || item.id === name);
    if (!record) throw new Error(tr("没有名为「{name}」的版式", { name }));
    const page = plugin.state.page as unknown as PageLike;
    const before = snapshotLayout(page, plugin.state.wordFont);
    applyLayout(page, record.settings);
    if (record.settings.wordFont) plugin.state.wordFont = record.settings.wordFont;
    try { return await job(); }
    finally { applyLayout(page, before); plugin.state.wordFont = before.wordFont; savePageSettings(plugin); }
  };

  return {
    version: 1,
    formats: API_FORMATS,
    listLayouts: () => (plugin.state.layouts ?? []).map(({ id, name }) => ({ id, name })),
    listTemplates: () => { const folder = plugin.state.userTemplates?.folder?.trim() ?? ""; return templateFiles(plugin).map(file => file.path.slice(folder.length + 1).replace(/\.md$/, "")); },

    async checkNote(path, format = "word") {
      try { const issues = await issuesOf(noteAt(path), format); return { ok: true, issues, warnings: describe(issues) }; }
      catch (error) { return failure(error); }
    },

    async createNote({ template, title, folder }) {
      try {
        const base = plugin.state.userTemplates?.folder?.trim() ?? "";
        const file = templateFiles(plugin).find(item => item.path === `${base}/${template}.md` || item.path === template || item.basename === template);
        if (!file) throw new Error(tr("找不到模板：{name}", { name: template }));
        const made = await createNoteFromTemplate(plugin, file, title, folder);
        return { ok: true, path: made.file.path, layoutApplied: made.layoutApplied, warnings: made.layoutMissing ? [tr("模板指定的版式「{name}」在这个库里不存在，没有套用", { name: made.layoutMissing })] : [] };
      } catch (error) { return failure(error); }
    },

    async exportNote(options) {
      let warnings: string[] = [];
      try {
        if (!API_FORMATS.includes(options.format)) throw new Error(tr("不支持的格式：{format}（可用：{list}）", { format: String(options.format), list: API_FORMATS.join(", ") }));
        const file = noteAt(options.path);
        warnings = describe((await issuesOf(file, options.format)).filter(issue => issue.level === "warn"));
        const output = await withLayout(options.layout, async () => {
          switch (options.format) {
            case "word": return exportWord(plugin, file);
            case "html": return exportHtml(plugin, file);
            case "pptx": {
              const path = await exportNotePptx(plugin, file);
              if (!path) throw new Error(tr("PPTX 没有生成，详情见屏幕上的提示"));
              return path;
            }
            default: {
              const files = [file, ...(options.more ?? []).map(noteAt)];
              const title = options.title?.trim() || file.basename;
              const { bytes, report } = await buildBook(plugin, files, { title, author: options.author?.trim() ?? "" });
              if (report.charts) warnings.push(tr("{n} 个图表没有收入", { n: report.charts }));
              if (report.missingImages) warnings.push(tr("{n} 张图片找不到", { n: report.missingImages }));
              if (report.remoteImages) warnings.push(tr("{n} 张网络图片没有收入", { n: report.remoteImages }));
              if (report.slow) warnings.push(tr("{n} 篇渲染超时，内容可能不全", { n: report.slow }));
              return saveExportToVault(plugin, `${title}.epub`, bytes);
            }
          }
        });
        return { ok: true, output: String(output), warnings };
      } catch (error) { return failure(error, warnings); }
    }
  };
}
