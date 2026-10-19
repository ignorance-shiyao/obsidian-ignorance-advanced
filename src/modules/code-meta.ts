/* Options written after a code fence's language: ```js title:"app.js" start=10 wrap {2,5}. Obsidian reads only the
   language, so with the plugin off the code is still complete and readable. */
export interface CodeMeta { title?: string; start?: number; wrap?: boolean }

const TITLE = /(?:^|\s)title\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i;

export function parseCodeMeta(fenceLine: string | undefined): CodeMeta {
  const fence = /^\s*(?:`{3,}|~{3,})\s*(.*?)\s*$/.exec(fenceLine ?? "");
  if (!fence) return {};
  const info = fence[1];
  const meta: CodeMeta = {};
  const title = TITLE.exec(info);
  if (title) { const text = (title[1] ?? title[2] ?? title[3] ?? "").trim(); if (text) meta.title = text.slice(0, 80); }
  const rest = info.replace(TITLE, " ");
  const start = /(?:^|\s)start\s*[:=]\s*(-?\d{1,6})(?=\s|$)/i.exec(rest);
  if (start) meta.start = Number(start[1]);
  if (/(?:^|\s)nowrap(?=\s|$)/i.test(rest)) meta.wrap = false;
  else if (/(?:^|\s)wrap(?=\s|$)/i.test(rest)) meta.wrap = true;
  return meta;
}

/** "+" and "-" lines of a diff, not the "+++" / "---" file headers. */
export function diffLineKind(line: string): "add" | "del" | null {
  if (/^(?:\+\+\+|---)(?:\s|$)/.test(line)) return null;
  return line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : null;
}
