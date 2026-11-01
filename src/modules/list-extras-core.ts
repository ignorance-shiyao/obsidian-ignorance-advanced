/* Block syntax, worked out from the note's source lines:
     - N rules (`---`) right before a list lay the list out in N + 1 columns (up to five)
     - `**==72==**` is a progress bar; `**==?==**` counts the ticked tasks of the list that follows */
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const LIST = /^\s*(?:[-*+]|\d+[.)])\s/;
const TASK = /^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]/;
const blank = (line: string | undefined) => line !== undefined && !line.trim();

/** How many columns the list starting at `line` asks for: 1 when no rules lead into it. */
export function listColumns(lines: string[], line: number) {
  if (!LIST.test(lines[line] || "")) return 1;
  let rules = 0;
  for (let at = line - 1; at >= 0; at--) {
    if (blank(lines[at])) continue;
    if (!RULE.test(lines[at])) break;
    rules++;
  }
  return rules ? Math.min(rules, 4) + 1 : 1;
}

/** True when the rule at `line` is one of those leading into a list (so it is hidden). */
export function ruleLeadsToList(lines: string[], line: number) {
  if (!RULE.test(lines[line] || "")) return false;
  for (let at = line + 1; at < lines.length; at++) {
    if (blank(lines[at]) || RULE.test(lines[at])) continue;
    return LIST.test(lines[at]);
  }
  return false;
}

/** Ticked share, in whole percent, of the tasks in the list that starts after `line` (blank lines may come first). */
export function taskProgressAfter(lines: string[], line: number): number | null {
  let at = line + 1;
  while (blank(lines[at])) at++;
  let done = 0, total = 0;
  for (; at < lines.length; at++) {
    const text = lines[at];
    if (blank(text)) { if (LIST.test(lines[at + 1] || "") || /^\s+\S/.test(lines[at + 1] || "")) continue; break; }
    if (!LIST.test(text) && !/^\s/.test(text)) break;
    const task = TASK.exec(text);
    if (!task) continue;
    total++;
    if (task[1] !== " ") done++;
  }
  return total ? Math.round((done / total) * 100) : null;
}

/** `72` / `-35` / `120.5` → number; `?` → "auto"; anything else → null. */
export function progressValue(text: string): number | "auto" | null {
  const value = text.trim();
  if (value === "?" || value === "？") return "auto";
  return /^[-+]?\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
}

/** The colour a progress bar takes when none is given: red below zero, green when done, orange past 100. */
export function progressTone(value: number): "rd" | "og" | "gn" | null {
  if (value < 0) return "rd";
  if (value > 100) return "og";
  if (value === 100) return "gn";
  return null;
}
