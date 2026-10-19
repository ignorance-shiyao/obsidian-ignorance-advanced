import { parseCaptions } from "./captions.js";
/* An ECharts block can take its data from a table in the same note. First line of the block:
     source: {#tab-sales}
   names the table whose caption line ends in {#tab-sales}. The rest of the block is the usual JSON; the table
   becomes `dataset.source` (header row first) unless the JSON already has its own dataset. */
const DIRECTIVE = /^\s*source\s*[:：]\s*\{#([\w-]+)\}\s*$/i;

export interface ChartSourceSplit { id: string | null; json: string }

export function splitChartSource(text: string): ChartSourceSplit {
  const lines = text.split(/\r?\n/);
  const first = lines.findIndex(line => line.trim());
  const match = first >= 0 ? DIRECTIVE.exec(lines[first]) : null;
  if (!match) return { id: null, json: text };
  return { id: match[1], json: lines.slice(first + 1).join("\n") };
}

export function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return body.split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, "|").trim());
}

const SEPARATOR = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

// "1,234" and "12%" read as numbers; empty cells stay empty; everything else stays text.
export function cellValue(text: string): string | number {
  const plain = text.replace(/,/g, "").replace(/%$/, "");
  return plain !== "" && /^-?\d+(\.\d+)?$/.test(plain) ? Number(plain) : text;
}

export function tableRows(source: string, id: string): (string | number)[][] {
  const lines = source.split(/\r?\n/);
  const caption = parseCaptions(source).find(entry => entry.id === id);
  if (!caption) throw new Error(`找不到编号为 {#${id}} 的题注`);
  if (caption.kind !== "tab") throw new Error(`{#${id}} 不是表格题注`);
  let end = caption.line - 1;
  while (end >= 0 && !lines[end].trim()) end -= 1;
  let start = end;
  while (start > 0 && /^\s*\|/.test(lines[start - 1])) start -= 1;
  const rows = lines.slice(start, end + 1).filter(line => !SEPARATOR.test(line)).map(line => splitRow(line).map((cell, index) => index === 0 ? cell : cellValue(cell)));
  if (rows.length < 2) throw new Error(`{#${id}} 对应的表格没有数据行`);
  return rows.map((row, index) => index === 0 ? row.map(String) : row);
}

export function resolveChartSource(text: string, note: string): string {
  const { id, json } = splitChartSource(text);
  if (!id) return text;
  const rows = tableRows(note, id);
  let option: unknown;
  try { option = JSON.parse(json.trim()); }
  catch (error) { throw new Error(`图表配置必须是有效 JSON：${error instanceof Error ? error.message : String(error)}`); }
  if (!option || typeof option !== "object" || Array.isArray(option)) throw new Error("图表配置根节点必须是 JSON 对象");
  const own = option as Record<string, unknown>;
  return JSON.stringify(own.dataset ? own : { dataset: { source: rows }, ...own });
}
