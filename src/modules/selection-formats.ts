import { tr, zh } from "../i18n.js";
/* Formats that wrap or convert the selected text: one list feeds both the right-click "Ignorance" submenu and the
   commands (so each can get a shortcut). Pure; the editor side is editor-menu.ts. A ⟦…⟧ pair marks the part
   left selected for the user to type over. */
export interface SelectionFormat {
  id: string;
  group: string;
  name: string;
  /** Turns the selected text into the replacement; may contain one ⟦placeholder⟧. */
  apply(selected: string): string;
  /** Block formats replace whole lines. */
  block?: boolean;
}

const lines = (text: string) => text.replace(/\n+$/, "").split("\n");
const HIGHLIGHTS: [string, string][] = [["red", zh("高亮：红")], ["orange", zh("高亮：橙")], ["green", zh("高亮：绿")], ["blue", zh("高亮：蓝")], ["purple", zh("高亮：紫")]];
const PILLS: [string, string][] = [["green", zh("徽章：绿")], ["red", zh("徽章：红")], ["blue", zh("徽章：蓝")], ["amber", zh("徽章：琥珀")], ["gray", zh("徽章：灰")]];
const CALLOUTS: [string, string][] = [["note", zh("标注块：笔记")], ["tip", zh("标注块：提示")], ["warning", zh("标注块：警告")], ["danger", zh("标注块：危险")], ["quote", zh("标注块：引用")]];

/** `> [!type]` with the lines as its body. Lines already quoted keep their quote level inside the callout. */
export function toCallout(text: string, type: string): string {
  return [`> [!${type}]`, ...lines(text).map(line => `> ${line}`.trimEnd())].join("\n");
}

export const SELECTION_FORMATS: SelectionFormat[] = [
  { id: "highlight-yellow", group: zh("高亮"), name: zh("高亮：默认"), apply: text => `==${text}==` },
  ...HIGHLIGHTS.map(([color, label]): SelectionFormat => ({ id: `highlight-${color}`, group: zh("高亮"), name: label, apply: text => `<mark data-highlight="${color}">${text}</mark>` })),
  ...PILLS.map(([color, label]): SelectionFormat => ({ id: `badge-${color}`, group: zh("徽章"), name: label, apply: text => `((${color}:${text}))` })),
  { id: "badge-two-part", group: zh("徽章"), name: zh("两段徽章（名称 | 状态）"), apply: text => `((green:${text} | ⟦${tr("状态")}⟧))` },
  { id: "spoiler", group: zh("文字"), name: zh("剧透（点击显示）"), apply: text => `((spoiler:${text}))` },
  { id: "ruby", group: zh("文字"), name: zh("注音"), apply: text => `((ruby:${text} | ⟦${tr("注音")}⟧))` },
  { id: "caption-table", group: zh("题注"), name: zh("设为表格题注"), apply: text => `表：${text.trim()} {#⟦tab-id⟧}`, block: true },
  { id: "caption-code", group: zh("题注"), name: zh("设为代码题注"), apply: text => `代码：${text.trim()} {#⟦code-id⟧}`, block: true },
  { id: "caption-equation", group: zh("题注"), name: zh("设为公式题注"), apply: text => `公式：${text.trim()} {#⟦eq-id⟧}`, block: true },
  ...CALLOUTS.map(([type, label]): SelectionFormat => ({ id: `callout-${type}`, group: zh("转为标注块"), name: label, apply: text => toCallout(text, type), block: true })),
  { id: "tabs", group: zh("版式块"), name: zh("放进页签"), apply: text => `::: tabs\n::: tab ⟦${tr("第一页")}⟧\n${lines(text).join("\n")}\n:::\n:::`, block: true },
  { id: "columns", group: zh("版式块"), name: zh("放进左栏（再加右栏）"), apply: text => `::: cols\n::: col\n${lines(text).join("\n")}\n:::\n::: col\n⟦${tr("右栏内容")}⟧\n:::\n:::`, block: true }
];

export function applyFormat(format: SelectionFormat, selected: string): { text: string; selectFrom: number; selectTo: number } {
  const body = format.apply(selected);
  const match = /⟦([^⟧]*)⟧/.exec(body);
  if (!match) return { text: body, selectFrom: body.length, selectTo: body.length };
  const text = body.replace(match[0], match[1]);
  return { text, selectFrom: match.index, selectTo: match.index + match[1].length };
}

/** `((ref:id))` for each caption id the note defines, in order. */
export function referenceItems(ids: string[]): { id: string; text: string }[] {
  return ids.map(id => ({ id, text: `((ref:${id}))` }));
}
