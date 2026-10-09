import { createLanguageIcon } from "./language-icons.js";
// A Typora-style language picker for code fences: type to filter, arrows and Enter to choose.
export interface LanguageEntry { id: string; label: string; aliases?: string[] }

import LIST from "./language-list.json";

// [id, label, aliases…]. Icons are resolved separately (language-icons.ts).
export const LANGUAGES: LanguageEntry[] = (LIST as string[][]).map(([id, label, ...aliases]) => ({ id, label, aliases }));
const isSubsequence = (needle: string, hay: string) => {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
};

function score(entry: LanguageEntry, query: string): number {
  const id = entry.id.toLowerCase(), label = entry.label.toLowerCase(), aliases = (entry.aliases || []).map(a => a.toLowerCase());
  if (id === query || label === query) return 100;
  if (aliases.includes(query)) return 95;
  if (id.startsWith(query) || label.startsWith(query)) return 80;
  if (aliases.some(a => a.startsWith(query))) return 75;
  if (id.includes(query) || label.includes(query) || aliases.some(a => a.includes(query))) return 50;
  if (query.length > 1 && (isSubsequence(query, id) || isSubsequence(query, label))) return 25;
  return 0;
}

// Empty query lists everything in its curated order; otherwise best matches first.
export function matchLanguages(query: string, list: LanguageEntry[] = LANGUAGES): LanguageEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.map((entry, index) => ({ entry, index, value: score(entry, q) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map(item => item.entry);
}

// Rewrites the language word of an opening fence line, keeping the rest of its info string.
export function withFenceLanguage(fence: string, language: string): string {
  const match = /^(\s*(?:`{3,}|~{3,}))\s*([\w+#.-]*)(.*)$/.exec(fence);
  if (!match) return fence;
  const rest = match[3];
  return `${match[1]}${language}${rest && language && !/^\s/.test(rest) ? " " : ""}${rest}`;
}

export function fenceLanguage(fence: string): string {
  return /^\s*(?:`{3,}|~{3,})\s*([\w+#.-]*)/.exec(fence)?.[1] || "";
}

export function openLanguagePicker({ anchor, current, onPick }: { anchor: HTMLElement; current: string; onPick: (language: string) => void }) {
  document.querySelectorAll(".ib-lang-picker").forEach(node => node.remove());
  const picker = document.body.createDiv({ cls: "ib-lang-picker" });
  const input = picker.createEl("input", { cls: "ib-lang-input", attr: { type: "text", placeholder: "输入语言，如 js、py、sql", spellcheck: "false", "aria-label": "搜索代码语言" } });
  const list = picker.createEl("ul", { cls: "ib-lang-list", attr: { role: "listbox" } });
  let items: LanguageEntry[] = [], active = 0, done = false;
  const close = () => { if (done) return; done = true; picker.remove(); document.removeEventListener("pointerdown", outside, true); };
  const outside = (event: Event) => { if (!picker.contains(event.target as Node)) close(); };
  const choose = (language: string) => { close(); onPick(language); };
  const render = () => {
    items = matchLanguages(input.value);
    active = Math.min(active, Math.max(0, items.length - 1));
    list.empty();
    const typed = input.value.trim();
    items.slice(0, 200).forEach((entry, index) => {
      const row = list.createEl("li", { cls: "ib-lang-item", attr: { role: "option", "aria-selected": String(index === active) } });
      row.toggleClass("is-active", index === active);
      row.toggleClass("is-current", entry.id.toLowerCase() === current.toLowerCase());
      row.appendChild(createLanguageIcon(entry.id));
      row.createSpan({ cls: "ib-lang-name", text: entry.label });
      if (entry.id) row.createSpan({ cls: "ib-lang-id", text: entry.id });
      row.addEventListener("pointerdown", event => { event.preventDefault(); choose(entry.id); });
      row.addEventListener("pointerenter", () => { active = index; highlight(); });
    });
    if (typed && !items.some(entry => entry.id.toLowerCase() === typed.toLowerCase())) {
      const row = list.createEl("li", { cls: "ib-lang-item ib-lang-custom", attr: { role: "option" } });
      row.appendChild(createLanguageIcon("__custom__"));
      row.createSpan({ cls: "ib-lang-name", text: `使用“${typed}”` });
      row.addEventListener("pointerdown", event => { event.preventDefault(); choose(typed); });
      if (!items.length) row.addClass("is-active");
    }
  };
  const highlight = () => {
    [...list.children].forEach((row, index) => { row.toggleClass("is-active", index === active); row.setAttribute("aria-selected", String(index === active)); });
    (list.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { active = 0; render(); });
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); active = Math.min(active + 1, list.children.length - 1); highlight(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); active = Math.max(active - 1, 0); highlight(); }
    else if (event.key === "Enter") { event.preventDefault(); const typed = input.value.trim(); choose(items.length ? items[active].id : typed); }
    else if (event.key === "Escape") { event.preventDefault(); close(); }
    event.stopPropagation();
  });
  render();
  const box = anchor.getBoundingClientRect();
  const width = 240, left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
  const below = window.innerHeight - box.bottom > 340;
  picker.style.cssText = `left:${left}px;width:${width}px;${below ? `top:${box.bottom + 4}px` : `bottom:${window.innerHeight - box.top + 4}px`}`;
  document.addEventListener("pointerdown", outside, true);
  window.setTimeout(() => { input.focus(); (list.children[Math.max(0, items.findIndex(e => e.id.toLowerCase() === current.toLowerCase()))] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" }); }, 0);
  return close;
}
