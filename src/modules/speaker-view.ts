import type { IgnorancePlugin } from "../plugin-types.js";
import { tr } from "../i18n.js";
import { ItemView, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import { formatElapsed } from "./speaker-notes-core.js";
/* The presenter's window: this slide's notes, a preview of the next slide, a timer, and page buttons. It reads
   from the open presentation (same app, so no messages are passed) and closes with it. On a phone it opens as a
   normal pane beside the slides instead of a separate window. */
export const SPEAKER_VIEW = "ibp-speaker-view";

export interface SpeakerSource {
  title: string;
  size: { width: number; height: number };
  slides(): { el: HTMLElement; notes: string; h: number; v: number }[];
  indices(): { h: number; v: number };
  next(): void;
  prev(): void;
  subscribe(listener: () => void): () => void;
  /** The `.reveal` root, used to copy the skin and variables onto the preview. */
  root(): HTMLElement | null;
}

export class SpeakerView extends ItemView {
  private source: SpeakerSource | null = null;
  private unsubscribe: (() => void) | null = null;
  private started = 0;
  private pausedAt = 0;
  private notesEl: HTMLElement;
  private previewEl: HTMLElement;
  private counterEl: HTMLElement;
  private timerEl: HTMLElement;
  private pauseButton: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, private plugin: IgnorancePlugin) { super(leaf); }
  getViewType() { return SPEAKER_VIEW; }
  getDisplayText() { return this.source ? `${this.source.title} · 演讲者` : "演讲者视图"; }
  getIcon() { return "lucide-presentation"; }
  getState() { return {}; }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass("ibp-speaker");
    const main = this.contentEl.createDiv({ cls: "ibp-speaker__main" });
    this.notesEl = main.createDiv({ cls: "ibp-speaker__notes" });
    const side = this.contentEl.createDiv({ cls: "ibp-speaker__side" });
    this.previewEl = side.createDiv({ cls: "ibp-speaker__preview" });
    this.counterEl = side.createDiv({ cls: "ibp-speaker__counter" });
    this.timerEl = side.createDiv({ cls: "ibp-speaker__timer" });
    const controls = side.createDiv({ cls: "ibp-speaker__controls" });
    const button = (icon: string, label: string, action: () => void) => {
      const element = controls.createEl("button", { attr: { "aria-label": label, title: label, type: "button" } });
      setIcon(element, icon);
      element.addEventListener("click", action);
      return element;
    };
    button("lucide-chevron-left", "上一页", () => this.source?.prev());
    button("lucide-chevron-right", "下一页", () => this.source?.next());
    this.pauseButton = button("lucide-pause", "暂停计时", () => this.togglePause());
    button("lucide-rotate-ccw", "计时归零", () => { this.started = Date.now(); this.pausedAt = this.pauseButton.dataset.paused ? Date.now() : 0; this.tick(); });
    this.registerInterval(window.setInterval(() => this.tick(), 500));
    // A speaker view restored from a saved layout has no presentation to read from.
    window.setTimeout(() => { if (!this.source) this.leaf.detach(); }, 1500);
    return Promise.resolve();
  }

  attach(source: SpeakerSource) {
    this.unsubscribe?.();
    this.source = source;
    this.started = Date.now();
    this.pausedAt = 0;
    this.unsubscribe = source.subscribe(() => this.refresh());
    (this.leaf as WorkspaceLeaf & { updateHeader?(): void }).updateHeader?.();
    this.refresh();
    this.tick();
  }

  onClose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.source = null;
    return Promise.resolve();
  }

  private togglePause() {
    const paused = Boolean(this.pausedAt);
    if (paused) { this.started += Date.now() - this.pausedAt; this.pausedAt = 0; delete this.pauseButton.dataset.paused; }
    else { this.pausedAt = Date.now(); this.pauseButton.dataset.paused = "1"; }
    setIcon(this.pauseButton, paused ? "lucide-pause" : "lucide-play");
    this.tick();
  }

  private tick() {
    if (this.timerEl) this.timerEl.setText(formatElapsed((this.pausedAt || Date.now()) - this.started));
  }

  refresh() {
    const source = this.source;
    if (!source) return;
    const slides = source.slides();
    const here = source.indices();
    const index = Math.max(0, slides.findIndex(slide => slide.h === here.h && slide.v === here.v));
    this.counterEl.setText(`${index + 1} / ${slides.length}`);
    const notes = slides[index]?.notes ?? "";
    this.notesEl.empty();
    if (notes) for (const paragraph of notes.split(/\n{2,}/)) this.notesEl.createEl("p", { text: paragraph });
    else this.notesEl.createDiv({ cls: "ibp-speaker__empty", text: tr("这一页没有备注。写法：%%备注：要讲的话%%") });
    this.renderPreview(slides[index + 1]?.el ?? null, source);
  }

  private renderPreview(slide: HTMLElement | null, source: SpeakerSource) {
    this.previewEl.empty();
    if (!slide) { this.previewEl.createDiv({ cls: "ibp-speaker__empty", text: tr("已是最后一页") }); return; }
    const { width, height } = source.size;
    const frame = this.previewEl.createDiv({ cls: "ibp-speaker__frame" });
    frame.setCssProps({ "--ibp-ratio": `${width} / ${height}` });
    const holder = frame.createDiv({ cls: "ibp-speaker__scale" });
    const root = source.root();
    holder.setCssProps({ width: `${width}px`, height: `${height}px` });
    const reveal = holder.createDiv({ cls: root?.className ?? "reveal" });
    if (root) reveal.style.cssText = root.style.cssText;
    reveal.setCssProps({ width: `${width}px`, height: `${height}px` });
    const slides = reveal.createDiv({ cls: "slides" });
    const clone = slide.cloneNode(true) as HTMLElement;
    clone.removeAttribute("style");
    clone.classList.remove("past", "future");
    clone.classList.add("present");
    slides.appendChild(clone);
    const fit = () => holder.setCssProps({ transform: `scale(${frame.clientWidth / width})` });
    fit();
    this.registerDomEvent(window, "resize", fit);
  }
}

export async function openSpeakerView(plugin: IgnorancePlugin, source: SpeakerSource, inline = Platform.isMobile) {
  const { workspace } = plugin.app;
  const leaf = inline ? workspace.getLeaf("split", "vertical") : workspace.openPopoutLeaf({ size: { width: 960, height: 620 } });
  await leaf.setViewState({ type: SPEAKER_VIEW, active: true });
  const view = leaf.view;
  if (!(view instanceof SpeakerView)) return null;
  view.attach(source);
  return view;
}
