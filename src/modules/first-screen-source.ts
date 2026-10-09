/* The opening of a note, cut at a blank line outside code fences and :::
   containers, long enough to fill the first few pages. Rendering the whole
   note first waited for every diagram in it (Obsidian's render resolves only
   once all are drawn), so the first page took seconds on a long note. */
export function firstScreenSource(source, maxChars = 6000) {
  if (source.length <= maxChars * 1.5) return null;
  let fence = null, depth = 0, offset = 0, cut = -1;
  for (const line of source.split("\n")) {
    const end = offset + line.length + 1;
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !line.trim().slice(fenceMatch[1].length).trim()) fence = null;
    } else if (fenceMatch) {
      fence = fenceMatch[1];
    } else if (/^\s*:::+\s*\S/.test(line)) {
      depth += 1;
    } else if (/^\s*:::+\s*$/.test(line)) {
      depth = Math.max(0, depth - 1);
    } else if (!line.trim() && !depth) {
      cut = offset;
      if (offset >= maxChars) break;
    }
    offset = end;
  }
  return cut > 0 && cut < source.length * 0.8 ? source.slice(0, cut) : null;
}

