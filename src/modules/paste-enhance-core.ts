import { parseDelimited, rowsToTable } from "./import-converters.js";

const BARE_URL = /^https?:\/\/[^\s<>]+$/i;

/** Pasting a lone URL over selected text makes a link; returns null when the paste should stay as it is. */
export function linkPasteMarkdown(selected: string, clipboard: string): string | null {
  const url = clipboard.trim();
  if (!BARE_URL.test(url) || !selected.trim() || /[\n[\]]/.test(selected)) return null;
  if (BARE_URL.test(selected.trim())) return null;
  return `[${selected}](${url})`;
}

/** Spreadsheet cells copied from Excel / Numbers / Sheets arrive as tab-separated text; returns a Markdown table or null. */
export function tablePasteMarkdown(clipboard: string): string | null {
  const text = clipboard.replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!text.includes("\t") || !text.includes("\n")) return null;
  const rows = parseDelimited(text, "\t").filter(row => row.some(cell => cell.trim() !== ""));
  if (rows.length < 2 || rows.some(row => row.length < 2)) return null;
  const table = rowsToTable(rows);
  return table ? table + "\n" : null;
}

/** True when the offset sits inside a fenced code block, where a paste must stay verbatim. */
export function insideFence(source: string, offset: number): boolean {
  let open = false;
  for (const line of source.slice(0, offset).split("\n")) if (/^\s*(?:```|~~~)/.test(line)) open = !open;
  return open;
}
