const DELIMITER = /^:?-{3,}:?$/;

export interface PipeCell {
  value: string;
  start: number;
  end: number;
}

export interface PipeTableRange {
  startLine: number;
  endLine: number;
  lines: string[];
}

export type TableEditAction =
  | "format"
  | "row-add-above"
  | "row-add-below"
  | "row-delete"
  | "row-move-up"
  | "row-move-down"
  | "column-add-left"
  | "column-add-right"
  | "column-delete"
  | "column-move-left"
  | "column-move-right";

export interface TableEditResult {
  lines: string[];
  rowIndex: number;
  columnIndex: number;
}

export function displayWidth(value: string) {
  let width = 0;
  const text = String(value ?? "");
  for (let index = 0; index < text.length;) {
    const codePoint = text.codePointAt(index)!;
    const char = String.fromCodePoint(codePoint);
    index += char.length;
    if (char === "\\" && index < text.length) {
      const next = String.fromCodePoint(text.codePointAt(index)!);
      if (/[|\\`*_{}\[\]()#+\-.!<>]/.test(next)) index += next.length;
      width += 1;
      continue;
    }
    if (char === "`" || /[\u0300-\u036f\ufe00-\ufe0f]/.test(char)) continue;
    width += isWide(codePoint) ? 2 : 1;
  }
  return width;
}

function isWide(codePoint: number) {
  return codePoint >= 0x1100 && (
    codePoint <= 0x11ff
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff01 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  ) || (codePoint >= 0x1f300 && codePoint <= 0x1faff);
}

export function parsePipeRow(line: string): PipeCell[] | null {
  const separators: number[] = [];
  let codeTicks = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\\") { index += 1; continue; }
    if (char === "`") {
      let end = index + 1;
      while (line[end] === "`") end += 1;
      const count = end - index;
      if (!codeTicks) codeTicks = count;
      else if (count === codeTicks) codeTicks = 0;
      index = end - 1;
      continue;
    }
    if (char === "|" && !codeTicks) separators.push(index);
  }
  if (!separators.length) return null;

  const leadingPipe = line.slice(0, separators[0]).trim().length === 0;
  const trailingPipe = line.slice(separators[separators.length - 1] + 1).trim().length === 0;
  const start = leadingPipe ? separators[0] + 1 : 0;
  const end = trailingPipe ? separators[separators.length - 1] : line.length;
  const inner = separators.filter(position => position > start && position < end);
  const bounds = [start, ...inner, end];
  const cells: PipeCell[] = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const from = bounds[index] + (index > 0 ? 1 : 0);
    const to = bounds[index + 1];
    const raw = line.slice(from, to);
    const leading = raw.match(/^\s*/)?.[0].length || 0;
    const trailing = raw.match(/\s*$/)?.[0].length || 0;
    const empty = raw.trim().length === 0;
    cells.push({
      value: raw.trim(),
      start: empty ? from + Math.min(1, raw.length) : from + leading,
      end: empty ? from + Math.min(1, raw.length) : Math.max(from + leading, to - trailing)
    });
  }
  return cells.length ? cells : null;
}

export function isTableDelimiter(line: string) {
  const cells = parsePipeRow(line);
  return Boolean(cells?.length && cells.every(cell => DELIMITER.test(cell.value)));
}

function fenceLines(lines: string[]) {
  const inside = new Array(lines.length).fill(false);
  let fence: { char: string; length: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (!fence) {
      if (match) {
        fence = { char: match[1][0], length: match[1].length };
        inside[index] = true;
      }
      continue;
    }
    inside[index] = true;
    const close = new RegExp(`^\\s{0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
    if (close.test(lines[index])) fence = null;
  }
  return inside;
}

export function findPipeTableAtLine(lines: string[], targetLine: number): PipeTableRange | null {
  const inFence = fenceLines(lines);
  for (let delimiterLine = 1; delimiterLine < lines.length; delimiterLine += 1) {
    if (inFence[delimiterLine] || inFence[delimiterLine - 1] || !isTableDelimiter(lines[delimiterLine])) continue;
    const header = parsePipeRow(lines[delimiterLine - 1]);
    const delimiter = parsePipeRow(lines[delimiterLine]);
    if (!header || !delimiter || header.length !== delimiter.length) continue;
    let endLine = delimiterLine;
    while (endLine + 1 < lines.length && !inFence[endLine + 1] && parsePipeRow(lines[endLine + 1])) endLine += 1;
    const startLine = delimiterLine - 1;
    if (targetLine >= startLine && targetLine <= endLine) {
      return { startLine, endLine, lines: lines.slice(startLine, endLine + 1) };
    }
    delimiterLine = endLine;
  }
  return null;
}

interface ParsedTable {
  rows: string[][];
  alignments: Array<"left" | "center" | "right" | "none">;
}

function parseTable(lines: string[]): ParsedTable | null {
  if (lines.length < 2 || !isTableDelimiter(lines[1])) return null;
  const parsed = lines.map(parsePipeRow);
  if (parsed.some(row => !row)) return null;
  const columnCount = Math.max(...parsed.map(row => row!.length));
  const rows = [parsed[0]!, ...parsed.slice(2).map(row => row!)].map(row =>
    Array.from({ length: columnCount }, (_, index) => row[index]?.value || "")
  );
  const alignments = parsed[1]!.map(cell => {
    const left = cell.value.startsWith(":");
    const right = cell.value.endsWith(":");
    return left && right ? "center" : left ? "left" : right ? "right" : "none";
  });
  while (alignments.length < columnCount) alignments.push("none");
  return { rows, alignments };
}

function formattedLines({ rows, alignments }: ParsedTable) {
  const columnCount = Math.max(...rows.map(row => row.length));
  const widths = Array.from({ length: columnCount }, (_, column) => {
    const marks = alignments[column] === "center" ? 2 : alignments[column] === "none" ? 0 : 1;
    return Math.max(3 + marks, ...rows.map(row => displayWidth(row[column] || "")));
  });
  const formatRow = row => `| ${widths.map((width, index) => {
    const value = row[index] || "";
    return value + " ".repeat(Math.max(0, width - displayWidth(value)));
  }).join(" | ")} |`;
  const formatDelimiter = () => `| ${widths.map((width, index) => {
    const dashes = "-".repeat(Math.max(3, width - (alignments[index] === "center" ? 2 : alignments[index] === "none" ? 0 : 1)));
    return alignments[index] === "center" ? `:${dashes}:`
      : alignments[index] === "left" ? `:${dashes}`
        : alignments[index] === "right" ? `${dashes}:` : dashes;
  }).join(" | ")} |`;
  return [formatRow(rows[0]), formatDelimiter(), ...rows.slice(1).map(formatRow)];
}

export function formatTableLines(lines: string[]) {
  const parsed = parseTable(lines);
  return parsed ? formattedLines(parsed) : null;
}

export function editTableLines(lines: string[], action: TableEditAction, rowIndex: number, columnIndex: number): TableEditResult | null {
  const parsed = parseTable(lines);
  if (!parsed) return null;
  const { rows, alignments } = parsed;
  const row = Math.max(0, Math.min(rowIndex, rows.length));
  const column = Math.max(0, Math.min(columnIndex, alignments.length - 1));
  let targetRow = row;
  let targetColumn = column;

  if (action === "row-add-above" || action === "row-add-below") {
    const insertAt = action === "row-add-above"
      ? row < 2 ? 1 : row - 1
      : row < 2 ? 1 : row;
    rows.splice(insertAt, 0, Array(alignments.length).fill(""));
    targetRow = insertAt + 1;
  } else if (action === "row-delete") {
    if (row < 2 || rows.length <= 1) return null;
    rows.splice(row - 1, 1);
    targetRow = Math.min(row, rows.length);
  } else if (action === "row-move-up" || action === "row-move-down") {
    if (row < 2) return null;
    const index = row - 1;
    const destination = index + (action === "row-move-up" ? -1 : 1);
    if (destination < 1 || destination >= rows.length) return null;
    const [moved] = rows.splice(index, 1);
    rows.splice(destination, 0, moved);
    targetRow = destination + 1;
  } else if (action === "column-add-left" || action === "column-add-right") {
    const insertAt = column + (action === "column-add-right" ? 1 : 0);
    rows.forEach(values => values.splice(insertAt, 0, ""));
    alignments.splice(insertAt, 0, "none");
    targetColumn = insertAt;
  } else if (action === "column-delete") {
    if (alignments.length <= 1) return null;
    rows.forEach(values => values.splice(column, 1));
    alignments.splice(column, 1);
    targetColumn = Math.min(column, alignments.length - 1);
  } else if (action === "column-move-left" || action === "column-move-right") {
    const destination = column + (action === "column-move-left" ? -1 : 1);
    if (destination < 0 || destination >= alignments.length) return null;
    rows.forEach(values => {
      const [moved] = values.splice(column, 1);
      values.splice(destination, 0, moved);
    });
    const [movedAlignment] = alignments.splice(column, 1);
    alignments.splice(destination, 0, movedAlignment);
    targetColumn = destination;
  }

  const next = formattedLines({ rows, alignments });
  return { lines: next, rowIndex: Math.max(0, Math.min(targetRow, next.length - 1)), columnIndex: targetColumn };
}
