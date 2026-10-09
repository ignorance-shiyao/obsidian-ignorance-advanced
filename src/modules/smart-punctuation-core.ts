export interface SmartPunctuationChange {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

function lineIsFenceOpening(line: string) {
  const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
  return match ? { char: match[1][0], length: match[1].length } : null;
}

export function isInsideCode(source: string, position: number) {
  const prefix = source.slice(0, Math.max(0, Math.min(position, source.length)));
  const lines = prefix.split("\n");
  let fence: { char: string; length: number } | null = null;
  for (const line of lines) {
    const opening = lineIsFenceOpening(line);
    if (!fence) {
      if (opening) fence = opening;
    } else {
      const close = new RegExp(`^\\s{0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
      if (close.test(line)) fence = null;
    }
  }
  if (fence) return true;

  const currentLine = lines.at(-1) || "";
  if (lineIsFenceOpening(currentLine)) return false;
  let codeTicks = 0;
  for (let index = 0; index < currentLine.length;) {
    if (currentLine[index] !== "`") { index += 1; continue; }
    let end = index + 1;
    while (currentLine[end] === "`") end += 1;
    const count = end - index;
    if (!codeTicks) codeTicks = count;
    else if (count === codeTicks) codeTicks = 0;
    index = end;
  }
  return Boolean(codeTicks);
}

export function smartPunctuationChange(source: string, position: number, typed: string, enabled: boolean): SmartPunctuationChange | null {
  if (!enabled || isInsideCode(source, position)) return null;
  if (typed === "-" && position >= 1 && source.slice(position - 1, position) === "-") {
    return { from: position - 1, to: position, insert: "—", cursor: position };
  }
  if (typed === "." && position >= 2 && source.slice(position - 2, position) === "..") {
    return { from: position - 2, to: position, insert: "…", cursor: position - 1 };
  }
  return null;
}
