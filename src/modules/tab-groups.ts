import { setIcon } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type { IgnorancePlugin } from "../plugin-types.js";
import { findTabGroups, tabRoleAt, type TabGroup, type TabKind } from "./tab-group-core.js";
/* Reading view: the tab bar replaces the `_^tab^_` line, and the tables, pictures and code after it show one at a
   time. Each section knows its own role from the source lines, so the order the sections render in does not
   matter. Paged reading and exports show every member, with the marker hidden (staged-enhance.ts). */
const ICONS: Record<TabKind, string> = { table: "table-2", image: "image", code: "code-2" };

const chosen = new Map<string, number>();
let cache: { text: string; groups: TabGroup[] } | null = null;

function groupsOf(text: string): TabGroup[] {
  if (cache?.text !== text) cache = { text, groups: findTabGroups(text.split("\n")) };
  return cache.groups;
}

const keyOf = (path: string, group: TabGroup) => `${path}\n${group.marker}`;

function show(scope: ParentNode, key: string, index: number) {
  scope.querySelectorAll<HTMLElement>("[data-ib-tab-key]").forEach(member => {
    if (member.dataset.ibTabKey !== key) return;
    if (Number(member.dataset.ibTabIndex) === index) member.removeAttribute("data-ib-tab-hidden");
    else member.setAttribute("data-ib-tab-hidden", "true");
  });
}

function buildBar(element: HTMLElement, key: string, group: TabGroup) {
  const bar = createDiv({ cls: "ib-tab-bar", attr: { role: "tablist" } });
  const buttons = group.members.map((member, index) => {
    const label = member.title || String(index + 1);
    const button = bar.createEl("button", { cls: "ib-tab-bar__tab", attr: { type: "button", role: "tab" } });
    setIcon(button.createSpan({ cls: "ib-tab-bar__icon" }), ICONS[member.kind]);
    button.createSpan({ cls: "ib-tab-bar__label", text: label });
    button.addEventListener("click", () => {
      chosen.set(key, index);
      sync(index);
      show(element.closest(".markdown-preview-sizer, .markdown-reading-view") ?? document, key, index);
    });
    return button;
  });
  const sync = (selected: number) => buttons.forEach((button, index) => {
    button.classList.toggle("is-selected", index === selected);
    button.setAttribute("aria-selected", String(index === selected));
  });
  sync(chosen.get(key) ?? 0);
  return bar;
}

function process(element: HTMLElement, context: MarkdownPostProcessorContext) {
  const info = context.getSectionInfo?.(element);
  if (!info || !info.text.includes("_^tab^_")) return;
  const role = tabRoleAt(groupsOf(info.text), info.lineStart);
  if (!role) return;
  const key = keyOf(context.sourcePath, role.group);
  if (role.role === "bar") {
    const marker = element.querySelector<HTMLElement>(":scope > p");
    if (marker) marker.replaceWith(buildBar(element, key, role.group));
    return;
  }
  element.dataset.ibTabKey = key;
  element.dataset.ibTabIndex = String(role.index);
  if ((chosen.get(key) ?? 0) !== role.index) element.setAttribute("data-ib-tab-hidden", "true");
}

export function installTabGroups(plugin: IgnorancePlugin) {
  plugin.registerMarkdownPostProcessor(process);
}
