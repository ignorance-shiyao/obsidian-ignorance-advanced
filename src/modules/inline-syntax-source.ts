export interface InlineSyntaxToken {
  kind: "chip" | "icon";
  type: "pill" | "bar" | "spark" | "icon";
  value: string;
  start: number;
  end: number;
  source: string;
  color?: string;
  label?: string;
  percent?: number;
  values?: number[];
  icon?: string;
}

const CHIP = /\(\(\s*([^()\n]+?)\s*\)\)/g;
const ICON = /:([a-z][a-z0-9-]*):/gi;
const COLORS = new Set(["green", "red", "blue", "amber", "gray", "primary"]);
const FRIENDLY_ICONS = { chart: "chart-column-increasing" };

function lineRanges(source: string, expression: RegExp): Array<{ from: number; to: number }> {
  const ranges = [];
  const lines = source.split("\n");
  let offset = 0;
  let fence = "";
  let fenceLength = 0;
  let fenceStart = 0;
  for (const line of lines) {
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (!fence && opening) {
      fence = opening[1][0];
      fenceLength = opening[1].length;
      fenceStart = offset;
    } else if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/)?.[1];
      if (closing && closing[0] === fence && closing.length >= fenceLength) {
        const end = offset + line.length + (offset + line.length < source.length ? 1 : 0);
        ranges.push({ from: fenceStart, to: end });
        fence = "";
        fenceLength = 0;
      }
    }
    offset += line.length + 1;
  }
  if (fence) ranges.push({ from: fenceStart, to: source.length });

  expression.lastIndex = 0;
  let match;
  while ((match = expression.exec(source))) ranges.push({ from: match.index, to: match.index + match[0].length });
  return ranges.sort((a, b) => a.from - b.from || b.to - a.to);
}

function protectedAt(ranges: Array<{ from: number; to: number }>, offset: number): boolean {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const range = ranges[mid];
    if (offset < range.from) high = mid - 1;
    else if (offset >= range.to) low = mid + 1;
    else return true;
  }
  return false;
}

function parseChip(inner: string, start: number, end: number, source: string): InlineSyntaxToken {
  const value = inner.trim();
  const bar = /^bar:\s*(\d{1,3})(?::\s*(.+))?$/i.exec(value);
  if (bar) return {
    kind: "chip", type: "bar", value, start, end, source,
    percent: Math.max(0, Math.min(100, Number(bar[1]))), label: bar[2]?.trim()
  };

  const spark = /^spark:\s*([-+\d.,\s]+)$/i.exec(value);
  if (spark) {
    const parts = spark[1].split(",").map(part => part.trim());
    const values = parts.map(Number);
    if (values.length >= 2 && values.length <= 32 && parts.every(part => /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(part))) {
      return { kind: "chip", type: "spark", value, start, end, source, values };
    }
  }

  const colored = /^([a-z]+):\s*(.+)$/i.exec(value);
  if (colored && COLORS.has(colored[1].toLowerCase())) return {
    kind: "chip", type: "pill", value: colored[2].trim(), color: colored[1].toLowerCase(), start, end, source
  };
  return { kind: "chip", type: "pill", value, start, end, source };
}

export function parseInlineSyntax(source: string, iconNames: Set<string> | null = null): InlineSyntaxToken[] {
  const protectedRanges = [
    ...lineRanges(source, /`+[^`\n]*`+/g),
    ...lineRanges(source, /<!--[\s\S]*?-->/g),
    ...lineRanges(source, /\[[^\]]*\]\((?:\\.|[^)])+\)/g)
  ].sort((a, b) => a.from - b.from || b.to - a.to);
  const tokens: InlineSyntaxToken[] = [];

  CHIP.lastIndex = 0;
  let match;
  while ((match = CHIP.exec(source))) {
    if (!protectedAt(protectedRanges, match.index)) {
      tokens.push(parseChip(match[1], match.index, match.index + match[0].length, match[0]));
    }
  }

  ICON.lastIndex = 0;
  while ((match = ICON.exec(source))) {
    const name = match[1].toLowerCase();
    if (protectedAt(protectedRanges, match.index)) continue;
    const before = source[match.index - 1] || "";
    if (/[a-z0-9_]/i.test(before)) continue;
    const lineStart = source.lastIndexOf("\n", match.index) + 1;
    const wordBefore = source.slice(lineStart, match.index).split(/\s/u).pop() || "";
    if (/^https?:\/\/\S*$/i.test(wordBefore)) continue;
    const icon = FRIENDLY_ICONS[name] || name;
    if (iconNames && !iconNames.has(name) && !iconNames.has(icon)) continue;
    tokens.push({ kind: "icon", type: "icon", value: name, icon, start: match.index, end: match.index + match[0].length, source: match[0] });
  }

  return tokens.sort((a, b) => a.start - b.start || a.end - b.end);
}

export { FRIENDLY_ICONS };
