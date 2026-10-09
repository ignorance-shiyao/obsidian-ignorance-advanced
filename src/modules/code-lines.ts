import { setBlockWidth } from "./block-width.js";
export function parseHighlightedCodeLines(fenceLine: string | undefined): number[] {
  if (!fenceLine) return [];
  const fence = /^\s*(?:`{3,}|~{3,})\s*(.*?)\s*$/.exec(fenceLine);
  if (!fence) return [];
  const info = fence[1].replace(/\s*\{align=(?:left|center|right)\}/g, "").replace(/\s*\{width=\d+\}/g, "");
  const meta = /(?:^|\s)\{([\d,\s-]+)\}\s*$/.exec(info);
  if (!meta) return [];
  const lines = new Set<number>();
  for (const part of meta[1].split(",")) {
    const range = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!range) continue;
    const start = Number(range[1]);
    const end = Number(range[2] || range[1]);
    if (!start || end < start || end - start > 2000) continue;
    for (let line = start; line <= end; line += 1) lines.add(line);
  }
  return [...lines].sort((a, b) => a - b);
}

interface CodeFenceEntry { lineStart: number; body: string; alignment: string; highlighted: number[]; }
const fenceEntriesCache = new Map<string, CodeFenceEntry[]>();
function parseCodeFenceEntries(markdown: string) {
  const cached = fenceEntriesCache.get(markdown);
  if (cached) return cached;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const entries: CodeFenceEntry[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^\s*(`{3,}|~{3,})\s*(.*?)\s*$/.exec(lines[index]);
    if (!opening) continue;
    const fence = opening[1];
    const close = new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
    let end = index + 1;
    while (end < lines.length && !close.test(lines[end])) end += 1;
    if (end >= lines.length) break;
    entries.push({
      lineStart: index,
      body: lines.slice(index + 1, end).join("\n"),
      alignment: lines[index].match(/\{align=(left|center|right)\}/)?.[1] || "center",
      width: Number(lines[index].match(/\{width=(\d+)\}/)?.[1]) || 0,
      highlighted: parseHighlightedCodeLines(lines[index])
    });
    index = end;
  }
  fenceEntriesCache.set(markdown, entries);
  if (fenceEntriesCache.size > 4) fenceEntriesCache.delete(fenceEntriesCache.keys().next().value);
  return entries;
}

export function fencedCodeContent(markdown: string, lineStart: number): string | undefined {
  return parseCodeFenceEntries(markdown).find(entry => entry.lineStart === lineStart)?.body;
}

export function applyCodeFenceHighlights(root: HTMLElement, markdown: string): void {
  const fences = parseCodeFenceEntries(markdown);
  let cursor = 0;
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    if (code.closest(".mermaid, .ib-echarts-block")) continue;
    const body = (code.textContent || "").replace(/\r\n?/g, "\n");
    const matches = fence => fence.body === body || fence.body === body.replace(/\n$/, "");
    let index = fences.findIndex((fence, candidate) => candidate >= cursor && matches(fence));
    if (index < 0) index = fences.findIndex((fence, candidate) => candidate >= cursor && fence.body.replace(/\n+$/, "") === body.replace(/\n+$/, ""));
    if (index < 0) index = fences.findIndex(matches);
    if (index < 0) continue;
    const highlighted = fences[index].highlighted;
    const pre = code.parentElement;
    if (pre) { pre.dataset.ibCodeHighlightLines = highlighted.join(","); pre.dataset.ibChartAlign = fences[index].alignment; setBlockWidth(pre, fences[index].width); }
    wrapCodeLines(code, highlighted, fences[index].body);
    cursor = index + 1;
  }
}

function splitNodeAtNewlines(node: Node): Node[][] {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").split("\n").map(part => [document.createTextNode(part)]);
  }
  if (!(node instanceof Element)) return [[node.cloneNode(true)]];
  const parts: Node[][] = [[]];
  for (const child of [...node.childNodes]) {
    const childLines = splitNodeAtNewlines(child);
    childLines.forEach((line, index) => {
      const clone = node.cloneNode(false);
      line.forEach(item => clone.appendChild(item));
      parts[parts.length - 1].push(clone);
      if (index < childLines.length - 1) parts.push([]);
    });
  }
  return parts;
}

export function wrapCodeLines(code: HTMLElement, highlighted: number[] = [], expectedSource?: string): number {
  const existingLines = [...code.querySelectorAll<HTMLElement>(":scope > .ib-code-line")];
  const sourceText = code.textContent || "";
  // Renderers differ in whether they retain the fence's terminal newline.
  // Only reconcile trailing newlines; never replace highlighted source text.
  const normalizedText = expectedSource !== undefined && expectedSource.replace(/\n+$/, "") === sourceText.replace(/\n+$/, "")
    ? expectedSource : existingLines.length ? sourceText : sourceText.replace(/\n$/, "");
  const expectedLineCount = Math.max(1, normalizedText.split("\n").length);
  const existingText = existingLines.map(line => line.textContent || "").join("\n");
  if (existingLines.length === expectedLineCount && existingText === normalizedText) {
    existingLines.forEach((line, index) => {
      if (highlighted.includes(index + 1)) line.dataset.highlighted = "true";
      else delete line.dataset.highlighted;
    });
    code.dataset.ibCodeLines = "true";
    return existingLines.length;
  }
  let source = [...code.childNodes];
  if (existingLines.length) {
    source = [];
    existingLines.forEach((line, index) => {
      source.push(...line.childNodes);
      if (index < existingLines.length - 1) source.push(document.createTextNode("\n"));
    });
  }
  let lines: Node[][] = [[]];
  for (const node of source) {
    const nodeLines = splitNodeAtNewlines(node);
    nodeLines.forEach((line, index) => {
      lines[lines.length - 1].push(...line);
      if (index < nodeLines.length - 1) lines.push([]);
    });
  }
  while (lines.length > expectedLineCount && !lines.at(-1)?.some(node => node.textContent)) lines.pop();
  while (lines.length < expectedLineCount) lines.push([]);
  // Assemble off-DOM and swap in once: appending line by line into a live
  // <code> costs a mutation (and observer work) per line.
  code.replaceChildren();
  const fragment = document.createDocumentFragment();
  lines.forEach((nodes, index) => {
    const line = document.createElement("span");
    line.className = "ib-code-line";
    line.dataset.line = String(index + 1);
    if (highlighted.includes(index + 1)) line.dataset.highlighted = "true";
    line.append(...nodes);
    fragment.appendChild(line);
    if (index < lines.length - 1) fragment.appendChild(document.createTextNode("\n"));
  });
  code.replaceChildren(fragment);
  code.classList.add("ib-code-lines");
  code.dataset.ibCodeLines = "true";
  return lines.length;
}
