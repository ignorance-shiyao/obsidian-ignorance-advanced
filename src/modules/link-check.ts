import type { IgnorancePlugin } from "../plugin-types.js";
import { Modal, Notice, MarkdownView } from "obsidian";
/* "检查当前笔记的链接": lists links and embeds that point nowhere, links to headings that do not exist, and
   headings that share a title (which makes `[[#标题]]` ambiguous). Read-only; nothing in the note changes. */
export interface LinkRef { link: string; line: number; kind: "link" | "embed" }
export interface Problem { kind: "missing-file" | "missing-heading" | "duplicate-heading"; text: string; line: number; detail?: string }

const normalizeHeading = (text: string) => text.replace(/[\s]+/g, " ").trim().toLowerCase();

/** `resolve(path)` returns null when the file does not exist, otherwise the headings of that file. */
export function analyzeNote(refs: LinkRef[], headings: Array<{ text: string; level: number; line: number }>, resolve: (path: string) => string[] | null): Problem[] {
  const problems: Problem[] = [];
  for (const ref of refs) {
    const [path, ...rest] = ref.link.split("#");
    const subpath = rest.join("#");
    const targetHeadings = path ? resolve(path) : headings.map(heading => heading.text);
    if (!targetHeadings) {
      problems.push({ kind: "missing-file", text: ref.link, line: ref.line, detail: ref.kind === "embed" ? "嵌入的文件不存在" : "链接的笔记不存在" });
      continue;
    }
    if (subpath && !subpath.startsWith("^")) {
      const wanted = normalizeHeading(subpath.split("#").pop() || "");
      if (wanted && !targetHeadings.some(text => normalizeHeading(text) === wanted)) {
        problems.push({ kind: "missing-heading", text: ref.link, line: ref.line, detail: "目标笔记里没有这个标题" });
      }
    }
  }
  const seen = new Map<string, number[]>();
  for (const heading of headings) {
    const key = `${heading.level}|${normalizeHeading(heading.text)}`;
    seen.set(key, [...(seen.get(key) || []), heading.line]);
  }
  for (const [key, lines] of seen) {
    if (lines.length > 1) problems.push({ kind: "duplicate-heading", text: key.split("|")[1], line: lines[1], detail: `同级标题重名，共 ${lines.length} 处` });
  }
  return problems.sort((a, b) => a.line - b.line);
}

export function openLinkCheck(plugin: IgnorancePlugin) {
  const { app } = plugin;
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  const file = view?.file;
  if (!file) { new Notice("请先打开一篇笔记"); return; }
  const cache = app.metadataCache.getFileCache(file) || {};
  const refs: LinkRef[] = [
    ...(cache.links || []).map(item => ({ link: item.link, line: item.position.start.line, kind: "link" as const })),
    ...(cache.embeds || []).map(item => ({ link: item.link, line: item.position.start.line, kind: "embed" as const }))
  ];
  const headings = (cache.headings || []).map(item => ({ text: item.heading, level: item.level, line: item.position.start.line }));
  const resolve = (path: string) => {
    const target = app.metadataCache.getFirstLinkpathDest(path, file.path);
    if (!target) return null;
    return (app.metadataCache.getFileCache(target)?.headings || []).map(item => item.heading);
  };
  const problems = analyzeNote(refs, headings, resolve);
  if (!problems.length) { new Notice("没有发现失效的链接或重名标题"); return; }

  class LinkCheckModal extends Modal {
    onOpen() {
      this.setTitle(`发现 ${problems.length} 个问题`);
      const list = this.contentEl.createDiv({ cls: "ib-link-check" });
      for (const problem of problems) {
        const row = list.createDiv({ cls: "ib-link-check__row" });
        row.createSpan({ cls: "ib-link-check__line", text: `第 ${problem.line + 1} 行` });
        row.createSpan({ cls: "ib-link-check__text", text: problem.text });
        row.createSpan({ cls: "ib-link-check__detail", text: problem.detail || "" });
        row.addEventListener("click", () => {
          this.close();
          view.setEphemeralState({ line: problem.line });
        });
      }
    }
    onClose() { this.contentEl.empty(); }
  }
  new LinkCheckModal(app).open();
}
