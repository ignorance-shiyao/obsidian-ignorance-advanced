/* Moving a heading moves its whole section: the lines below it up to the next heading of the same or a higher
   level (so sub-sections travel along). Headings inside code fences or front matter are not headings. */
export interface Section { start: number; end: number; level: number }

export function headingLevels(lines: string[]): number[] {
  const levels: number[] = [];
  let fence = "";
  let front = lines[0]?.trim() === "---";
  lines.forEach((line, index) => {
    if (front) { levels.push(0); if (index > 0 && /^(---|\.\.\.)\s*$/.test(line)) front = false; return; }
    const marker = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = "";
      levels.push(0);
      return;
    }
    const heading = !fence ? /^ {0,3}(#{1,6})\s+\S/.exec(line) : null;
    levels.push(heading ? heading[1].length : 0);
  });
  return levels;
}

// The section whose heading is the closest one at or above `line` (0-based). Null before the first heading.
export function sectionAt(lines: string[], line: number): Section | null {
  const levels = headingLevels(lines);
  let start = Math.min(line, lines.length - 1);
  while (start >= 0 && !levels[start]) start -= 1;
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !(levels[end] && levels[end] <= levels[start])) end += 1;
  return { start, end, level: levels[start] };
}

export interface Move { text: string; from: number; to: number }

// Swaps the section with its previous or next sibling (same level, same parent). Null when there is none.
export function moveSection(text: string, line: number, direction: "up" | "down"): Move | null {
  const lines = text.split("\n");
  const section = sectionAt(lines, line);
  if (!section) return null;
  const levels = headingLevels(lines);
  let other: Section | null = null;
  if (direction === "down") {
    if (section.end < lines.length && levels[section.end] === section.level) other = sectionAt(lines, section.end);
  } else {
    let at = section.start - 1;
    while (at >= 0 && !(levels[at] && levels[at] <= section.level)) at -= 1;
    if (at >= 0 && levels[at] === section.level) other = sectionAt(lines, at);
  }
  if (!other) return null;
  const [first, second] = direction === "down" ? [section, other] : [other, section];
  // Keep a closing line break when the moved block was last in the file and had none.
  const a = lines.slice(first.start, first.end), b = lines.slice(second.start, second.end);
  const rebuilt = [...lines.slice(0, first.start), ...b, ...a, ...lines.slice(second.end)];
  return { text: rebuilt.join("\n"), from: section.start, to: direction === "down" ? first.start + b.length : first.start };
}
