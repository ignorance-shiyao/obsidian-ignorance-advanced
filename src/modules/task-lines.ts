export const TASK_LINE = /^((?:[ \t]*>[ \t]*)*[ \t]*(?:[-+*]|\d+[.)])[ \t]+\[)([ xX])(\](?:[ \t]|$)[^\n]*)$/;

export function sourceTaskLines(text: string): Array<{ index: number; line: string }> {
  const lines = text.split("\n");
  const tasks: Array<{ index: number; line: string }> = [];
  let frontmatter = lines[0]?.replace(/\r$/, "").trim() === "---";
  let fence: { character: string; length: number; markdown: boolean } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (frontmatter) {
      if (index > 0 && line.replace(/\r$/, "").trim() === "---") frontmatter = false;
      continue;
    }
    const unquoted = line.replace(/^(?:[ \t]*>[ \t]*)+/, "");
    const marker = unquoted.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = {
        character: marker[1][0],
        length: marker[1].length,
        markdown: /^\s*(?:md|markdown)(?:\s|$)/i.test(marker[2])
      };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if ((!fence || fence.markdown) && TASK_LINE.test(line)) tasks.push({ index, line });
  }
  return tasks;
}
