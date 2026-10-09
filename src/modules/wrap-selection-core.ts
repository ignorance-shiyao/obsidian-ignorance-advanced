// Obsidian's "Auto pair Markdown syntax" already wraps a selection in * _ `;
// only == highlight is missing there.
export const WRAP_MARKERS = ["="] as const;

export function wrapMarkerPair(marker: string) {
  if (!WRAP_MARKERS.includes(marker as typeof WRAP_MARKERS[number])) return null;
  const token = marker === "=" ? "==" : marker;
  return { before: token, after: token };
}

export function wrapSelectionChange(source: string, from: number, to: number, marker: string) {
  const pair = wrapMarkerPair(marker);
  if (from >= to || !pair) return null;
  const selected = source.slice(from, to);
  return {
    text: `${source.slice(0, from)}${pair.before}${selected}${pair.after}${source.slice(to)}`,
    selection: { from: from + pair.before.length, to: to + pair.before.length }
  };
}
