import { setIcon } from "obsidian";

/* Small building blocks shared by the knowledge views. Class names: ig-kb-*. */

export function kbHeader(root: HTMLElement, title: string): HTMLElement {
  const head = root.createDiv({ cls: "ig-kb-head" });
  head.createEl("h2", { cls: "ig-kb-title", text: title });
  return head.createDiv({ cls: "ig-kb-actions" });
}

export function kbIconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = parent.createEl("button", { cls: "ig-kb-icon-btn clickable-icon", attr: { "aria-label": label, type: "button" } });
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

export function kbSection(root: HTMLElement, title: string, count?: number): HTMLElement {
  const section = root.createDiv({ cls: "ig-kb-section" });
  const head = section.createDiv({ cls: "ig-kb-section-head" });
  head.createSpan({ text: title });
  if (count !== undefined) head.createSpan({ cls: "ig-kb-count", text: String(count) });
  return section.createDiv({ cls: "ig-kb-section-body" });
}

export function kbTile(parent: HTMLElement, label: string, value: number | string, tone?: "warn", onClick?: () => void): HTMLElement {
  const tile = parent.createEl(onClick ? "button" : "div", { cls: "ig-kb-tile", attr: onClick ? { type: "button" } : {} });
  if (tone) tile.addClass(`is-${tone}`);
  tile.createDiv({ cls: "ig-kb-tile-value", text: String(value) });
  tile.createDiv({ cls: "ig-kb-tile-label", text: label });
  if (onClick) tile.addEventListener("click", onClick);
  return tile;
}

export function kbRow(parent: HTMLElement, opts: { icon?: string; label: string; meta?: string; tone?: "warn"; onClick?: () => void }): HTMLElement {
  const row = parent.createEl(opts.onClick ? "button" : "div", { cls: "ig-kb-row", attr: opts.onClick ? { type: "button" } : {} });
  if (opts.tone) row.addClass(`is-${opts.tone}`);
  if (opts.icon) setIcon(row.createSpan({ cls: "ig-kb-row-icon" }), opts.icon);
  row.createSpan({ cls: "ig-kb-row-label", text: opts.label });
  if (opts.meta !== undefined) row.createSpan({ cls: "ig-kb-row-meta", text: opts.meta });
  if (opts.onClick) row.addEventListener("click", opts.onClick);
  return row;
}

export function kbEmpty(parent: HTMLElement, text: string) {
  parent.createDiv({ cls: "ig-kb-empty", text });
}

/** "2026-11-15" style local date. */
export function kbDate(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Appends items in slices so very long lists do not block a frame. */
export function renderInBatches<T>(items: readonly T[], size: number, draw: (item: T) => void, isAlive: () => boolean = () => true) {
  let at = 0;
  const step = () => {
    if (!isAlive()) return;
    const end = Math.min(items.length, at + size);
    for (; at < end; at++) draw(items[at]);
    if (at < items.length) window.requestAnimationFrame(step);
  };
  step();
}
