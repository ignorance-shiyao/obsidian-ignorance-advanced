/* Per-document line lookups for post-processors that run once per block.
   Splitting the whole note for every table or code block made rendering a
   long note quadratic; the last few texts' line offsets are kept instead. */

const cache: { text: string; starts: number[] }[] = [];

export function lineStarts(text: string): number[] {
  const hit = cache.find(entry => entry.text === text);
  if (hit) return hit.starts;
  const starts = [0];
  for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) starts.push(index + 1);
  cache.unshift({ text, starts });
  cache.length = Math.min(cache.length, 3);
  return starts;
}

export function lineAt(text: string, line: number): string | undefined {
  const starts = lineStarts(text);
  if (line < 0 || line >= starts.length) return undefined;
  const end = line + 1 < starts.length ? starts[line + 1] - 1 : text.length;
  return text.slice(starts[line], end).replace(/\r$/, "");
}

export function lineRange(text: string, from: number, to: number): string {
  const starts = lineStarts(text);
  const start = starts[Math.max(0, from)] ?? text.length;
  const end = to < starts.length ? starts[to] - 1 : text.length;
  return end > start ? text.slice(start, end) : "";
}
