import { Notice } from "obsidian";
import type { Editor } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { moveSection } from "./section-move-core.js";
/* Commands that move the section under the cursor (its heading, text and sub-sections) above or below its
   neighbour of the same level, as a single edit that one undo reverts. */
function run(editor: Editor, direction: "up" | "down") {
  const cursor = editor.getCursor();
  const text = editor.getValue();
  const moved = moveSection(text, cursor.line, direction);
  if (!moved) { new Notice(direction === "up" ? "上面没有同级章节可以交换" : "下面没有同级章节可以交换", 3000); return; }
  // Only the swapped span is rewritten, so the rest of the note keeps its folds and scroll position.
  const before = text.split("\n"), after = moved.text.split("\n");
  let head = 0, tail = 0;
  while (head < before.length && before[head] === after[head]) head += 1;
  while (tail < before.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  if (head >= before.length) return;
  editor.replaceRange(after.slice(head, after.length - tail).join("\n"), { line: head, ch: 0 }, { line: before.length - tail - 1, ch: before[before.length - tail - 1].length });
  editor.setCursor({ line: moved.to, ch: 0 });
}

export function installSectionMove(plugin: IgnorancePlugin) {
  plugin.addCommand({ id: "move-section-up", name: "章节上移（连同子章节）", icon: "lucide-arrow-up", editorCallback: editor => run(editor, "up") });
  plugin.addCommand({ id: "move-section-down", name: "章节下移（连同子章节）", icon: "lucide-arrow-down", editorCallback: editor => run(editor, "down") });
}
