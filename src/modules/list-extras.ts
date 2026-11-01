import type { MarkdownPostProcessorContext } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { colorVar, parseColorCode, type ColorCode } from "./color-code-core.js";
import { listColumns, progressTone, progressValue, ruleLeadsToList, taskProgressAfter } from "./list-extras-core.js";
/* List columns and progress bars in Reading view and exports (syntax in list-extras-core.ts). */

const isRule = (node: Element | null) => Boolean(node && (node.tagName === "HR" || (node.children.length === 1 && node.firstElementChild?.tagName === "HR" && !node.textContent?.trim())));

/** Without source lines (an export renders the whole note at once): count the rules just before the list. */
function columnsFromDom(list: HTMLElement) {
  const holder = list.parentElement?.children.length === 1 && list.parentElement.tagName === "DIV" ? list.parentElement : list;
  let rules = 0;
  const seen: Element[] = [];
  for (let prev = holder.previousElementSibling; isRule(prev); prev = prev.previousElementSibling) { rules++; seen.push(prev); }
  seen.forEach(rule => rule.classList.add("ib-list-columns-rule"));
  return rules ? Math.min(rules, 4) + 1 : 1;
}

function layoutColumns(element: HTMLElement, lines: string[] | null, start: number) {
  if (lines && element.querySelector(":scope > hr") && ruleLeadsToList(lines, start)) element.classList.add("ib-list-columns-rule");
  for (const list of element.querySelectorAll<HTMLElement>(":scope > ul, :scope > ol")) {
    const columns = lines ? listColumns(lines, start) : columnsFromDom(list);
    if (columns < 2) continue;
    list.classList.add("ib-list-columns");
    list.style.setProperty("--ib-list-columns", String(columns));
  }
}

function taskShare(item: HTMLElement) {
  const boxes = [...item.querySelectorAll<HTMLInputElement>(":scope > ul input.task-list-item-checkbox, :scope > ol input.task-list-item-checkbox")];
  if (!boxes.length) return null;
  return Math.round((boxes.filter(box => box.checked).length / boxes.length) * 100);
}

function progressBar(value: number, color: ColorCode | null) {
  const bar = createSpan({ cls: "ib-inline-bar ib-progress" });
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", `${value}%`);
  const track = bar.createSpan({ cls: "ib-inline-bar__track" });
  const fill = track.createSpan({ cls: "ib-inline-bar__fill" });
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  const tone = color || progressTone(value);
  if (tone) bar.style.setProperty("--ib-progress-color", colorVar(tone));
  bar.createSpan({ cls: "ib-inline-bar__value", text: `${value}%` });
  return bar;
}

function renderProgress(element: HTMLElement, lines: string[] | null, end: number) {
  for (const mark of element.querySelectorAll<HTMLElement>("strong > mark:only-child")) {
    const strong = mark.parentElement;
    if (!strong || strong.textContent?.trim() !== mark.textContent?.trim() || strong.closest("code, pre")) continue;
    const raw = progressValue(mark.textContent || "");
    if (raw === null) continue;
    const item = strong.closest<HTMLElement>("li");
    // A colour code after the bar (`**==80==**_~Rd~_`) has already coloured the <strong>.
    const color = strong.dataset.ibColor ? parseColorCode(`~${strong.dataset.ibColor}~`)?.colors[0] ?? null : null;
    const value = raw !== "auto" ? raw : item ? taskShare(item) : lines ? taskProgressAfter(lines, end) : null;
    if (value !== null) strong.replaceWith(progressBar(value, color));
    // No source lines (a whole note rendered at once): the list that follows is a later sibling, there next frame.
    else if (raw === "auto" && !item && !lines) window.requestAnimationFrame(() => {
      const share = followingListShare(strong);
      if (share !== null && strong.isConnected) strong.replaceWith(progressBar(share, color));
    });
  }
}

function followingListShare(from: HTMLElement) {
  let block: Element | null = from.closest("p") || from;
  while (block && !block.nextElementSibling && block.parentElement) block = block.parentElement;
  for (let next = block?.nextElementSibling; next; next = next.nextElementSibling) {
    const list = next.matches("ul, ol") ? next : next.querySelector(":scope > ul, :scope > ol");
    if (!list && next.textContent?.trim()) return null;
    if (!list) continue;
    const boxes = [...list.querySelectorAll<HTMLInputElement>("input.task-list-item-checkbox")];
    return boxes.length ? Math.round((boxes.filter(box => box.checked).length / boxes.length) * 100) : null;
  }
  return null;
}

export function renderListExtras(element: HTMLElement, context: MarkdownPostProcessorContext, retry = true) {
  const info = context.getSectionInfo?.(element);
  // A section can be processed before it is attached; its source lines are known once it is.
  if (!info && retry && !element.isConnected) {
    window.requestAnimationFrame(() => renderListExtras(element, context, false));
    return;
  }
  const lines = info ? info.text.split("\n") : null;
  layoutColumns(element, lines, info?.lineStart ?? 0);
  renderProgress(element, lines, info?.lineEnd ?? 0);
}

export function installListExtras(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor((element, context) => renderListExtras(element, context));
}
