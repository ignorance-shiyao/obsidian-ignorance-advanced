import { headingLevels } from "./section-move-core.js";
/* The headings of a note as a Mermaid mindmap: the note title is the root, each heading a node under the
   nearest shallower heading. Headings in code fences and front matter are skipped. */
const label = (text: string) => text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, target: string, alias: string) => alias || target).replace(/[*_`~]/g, "").replace(/"/g, "'").replace(/\s+/g, " ").trim();

export function headingsToMindmap(text: string, title: string): string | null {
  const lines = text.split("\n");
  const levels = headingLevels(lines);
  const stack: number[] = [];
  const out = ["mindmap", `  root["${label(title) || "笔记"}"]`];
  let count = 0;
  lines.forEach((line, index) => {
    const level = levels[index];
    if (!level) return;
    const name = label(line.replace(/^ {0,3}#{1,6}\s+/, "").replace(/\s+#+\s*$/, ""));
    if (!name) return;
    while (stack.length && stack[stack.length - 1] >= level) stack.pop();
    stack.push(level);
    count += 1;
    out.push(`${"  ".repeat(stack.length + 1)}n${count}["${name}"]`);
  });
  return count ? out.join("\n") : null;
}
