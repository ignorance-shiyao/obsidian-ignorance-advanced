import { tr } from "../i18n.js";
import { IMAGE_EXTENSIONS } from "./import-converters.js";
import { parseCaptions } from "./captions.js";

export interface ExportIssue {
  /** 1-based line in the note. */
  line: number;
  /** warn: the output will lack something. note: the output differs from the screen. */
  level: "warn" | "note";
  message: string;
}

export interface ExportCheckOptions {
  kind: string;
  /** Whether a link target (an embed name or a path in the note) resolves to a file. */
  exists(target: string): boolean;
  /** Word only: the font family the document will name. */
  wordFont?: string;
}

const DYNAMIC_FENCES = new Set(["dataview", "dataviewjs", "base", "tasks", "query"]);
const REMOTE = /^https?:/i;
const SKIP_TARGET = /^(?:data:|mailto:|\/|[A-Za-z]:[\\/])/i;

function cleanTarget(raw: string) {
  const target = raw.replace(/^<|>$/g, "").replace(/\s+(?:"[^"]*"|'[^']*')\s*$/, "").split("#")[0].split("|")[0].trim();
  try { return decodeURIComponent(target); } catch { return target; }
}

/** Reads the note source once and lists what the chosen export cannot carry over, with the line each one sits on. */
export function scanExportIssues(source: string, options: ExportCheckOptions): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const ids = new Set(parseCaptions(source).map(entry => entry.id).filter(Boolean));
  const word = options.kind === "word";
  let fence = "";
  let remoteLine = 0, remoteCount = 0, diagrams = 0;
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const marker = /^\s*(`{3,}|~{3,})\s*([\w-]*)(.*)$/.exec(raw);
    if (marker) {
      if (!fence) {
        fence = marker[1];
        const language = marker[2].toLowerCase();
        if (DYNAMIC_FENCES.has(language)) {
          issues.push({ line, level: "note", message: word ? tr("{language} 动态块：Word 会把它当作普通代码，不含查询结果", { language }) : tr("{language} 动态块：只导出阅读视图当时显示的结果，请先确认内容已出现", { language }) });
        } else if (language === "mermaid") {
          diagrams += 1;
          if (word) issues.push({ line, level: "note", message: tr("Mermaid 图表会转成图片；渲染失败时 Word 里会留下源码") });
        }
      } else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2] && !marker[3].trim()) fence = "";
      return;
    }
    if (fence) return;
    const text = raw.replace(/`[^`\n]*`/g, "");
    for (const match of text.matchAll(/!\[\[([^\]]+)\]\]/g)) {
      const target = cleanTarget(match[1]);
      if (!IMAGE_EXTENSIONS.test(target) || options.exists(target)) continue;
      issues.push({ line, level: "warn", message: tr("找不到图片「{target}」，导出里会缺这张图", { target }) });
    }
    for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, "");
      if (REMOTE.test(target)) { remoteCount += 1; remoteLine ||= line; continue; }
      if (SKIP_TARGET.test(target)) continue;
      const path = cleanTarget(match[1]);
      if (path && !options.exists(path)) issues.push({ line, level: "warn", message: tr("找不到图片「{path}」，导出里会缺这张图", { path }) });
    }
    for (const match of text.matchAll(/\(\(ref:([^)\s]+)\)\)/g)) {
      if (!ids.has(match[1])) issues.push({ line, level: "warn", message: tr("交叉引用「{id}」没有对应的题注标识，会显示为 ?{id}", { id: match[1] }) });
    }
  });
  if (remoteCount) issues.push({ line: remoteLine, level: "note", message: tr("{remoteCount} 张网络图片，导出时才下载（离线或链接失效会缺图）", { remoteCount }) });
  if (diagrams && !word) issues.push({ line: 0, level: "note", message: tr("{diagrams} 个 Mermaid 图表，以导出时的渲染结果为准", { diagrams }) });
  if (word && options.wordFont) issues.push({ line: 0, level: "note", message: tr("Word 字体为「{wordFont}」，打开文档的电脑没有这个字体时会被替换", { wordFont: options.wordFont }) });
  return issues.filter(issue => issue.line > 0 || issue.level === "note").sort((a, b) => (a.line || Infinity) - (b.line || Infinity));
}
