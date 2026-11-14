import { TFile } from "obsidian";
import type { App, CachedMetadata, TAbstractFile } from "obsidian";
import { buildNote, isExcluded, parseTaskDue } from "./kb-index-core.js";
import type { KbFolders, KbNote, NoteSource } from "./kb-index-core.js";

/* The shared knowledge-base index. Built from metadataCache, getMarkdownFiles() and file stats only;
   kept current by resolved / changed / rename / delete events, batched with a 500 ms debounce. */

export const KB_DEBOUNCE_MS = 500;

export function noteSource(file: TFile, cache: CachedMetadata | null, links: Record<string, number> | undefined, unresolved: Record<string, number> | undefined): NoteSource {
  return {
    path: file.path,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
    size: file.stat.size,
    frontmatter: cache?.frontmatter ?? null,
    tags: (cache?.tags ?? []).map(tag => tag.tag),
    links,
    unresolved,
    tasks: (cache?.listItems ?? []).filter(item => item.task !== undefined).map(item => ({ mark: item.task ?? "", line: item.position.start.line })),
    sections: cache ? (cache.sections ?? []).map(section => section.type) : undefined
  };
}

export class KbIndex {
  notes = new Map<string, KbNote>();
  version = 0;
  /** Milliseconds the last full build and the last incremental update took. */
  timing = { build: 0, update: 0 };
  private dues = new Map<string, { mtime: number; dues: (number | null)[] }>();
  private dirty = new Set<string>();
  private full = true;
  private resolvedOnce = false;
  private timer = 0;
  private listeners = new Set<() => void>();
  private detach: (() => void)[] = [];

  constructor(private app: App, private folders: () => KbFolders) {}

  start() {
    const { metadataCache, vault } = this.app;
    const cacheRefs = [
      // The first "resolved" after startup completes every note's links: rebuild once then.
      metadataCache.on("resolved", () => { if (!this.resolvedOnce) { this.resolvedOnce = true; this.full = true; } if (this.full || this.dirty.size) this.schedule(); }),
      metadataCache.on("changed", file => this.mark(file.path))
    ];
    const vaultRefs = [
      vault.on("rename", (file: TAbstractFile, old: string) => { this.linkersOf(old); this.notes.delete(old); this.mark(file.path); }),
      vault.on("delete", (file: TAbstractFile) => { this.linkersOf(file.path); if (this.notes.delete(file.path)) this.schedule(); })
    ];
    this.detach.push(() => { for (const ref of cacheRefs) metadataCache.offref(ref); for (const ref of vaultRefs) vault.offref(ref); });
    this.full = true;
    this.resolvedOnce = !metadataCache.resolvedLinks || Object.keys(metadataCache.resolvedLinks).length > 0;
    this.flush();
  }

  stop() {
    window.clearTimeout(this.timer);
    for (const fn of this.detach.splice(0)) fn();
    this.listeners.clear();
  }

  /** Folder settings changed: rebuild everything. */
  reset() { this.full = true; this.schedule(); }

  /** Redraw subscribers without rebuilding (a setting they read changed). */
  notify() { for (const listener of this.listeners) listener(); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  all(): KbNote[] { return [...this.notes.values()]; }

  /** Notes linking to a path that moved or vanished: their resolved links change too. */
  private linkersOf(path: string) {
    for (const note of this.notes.values()) if (note.links.includes(path)) this.dirty.add(note.path);
  }

  private mark(path: string) {
    if (!path.endsWith(".md")) return;
    this.dirty.add(path);
    this.schedule();
  }

  private schedule() {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.flush(), KB_DEBOUNCE_MS);
  }

  private build(file: TFile, folders: KbFolders): KbNote {
    const { metadataCache } = this.app;
    return buildNote(noteSource(file, metadataCache.getFileCache(file), metadataCache.resolvedLinks[file.path], metadataCache.unresolvedLinks[file.path]), folders);
  }

  /** Due dates (📅) of every open task, read from the task lines only and cached per file version. */
  async taskDues(): Promise<Map<string, (number | null)[]>> {
    const out = new Map<string, (number | null)[]>();
    for (const note of this.notes.values()) {
      if (!note.openTaskLines.length) continue;
      let entry = this.dues.get(note.path);
      if (!entry || entry.mtime !== note.mtime) {
        const file = this.app.vault.getAbstractFileByPath(note.path);
        if (!(file instanceof TFile)) continue;
        const lines = (await this.app.vault.cachedRead(file)).split("\n");
        entry = { mtime: note.mtime, dues: note.openTaskLines.map(line => parseTaskDue(lines[line] ?? "")) };
        this.dues.set(note.path, entry);
      }
      out.set(note.path, entry.dues);
    }
    for (const path of this.dues.keys()) if (!this.notes.has(path)) this.dues.delete(path);
    return out;
  }

  flush() {
    window.clearTimeout(this.timer);
    const started = performance.now();
    const wasFull = this.full;
    const folders = this.folders();
    if (this.full) {
      this.full = false;
      this.dirty.clear();
      this.notes.clear();
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (!isExcluded(file.path, folders)) this.notes.set(file.path, this.build(file, folders));
      }
    } else {
      for (const path of this.dirty) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile && file.extension === "md" && !isExcluded(path, folders)) this.notes.set(path, this.build(file, folders));
        else this.notes.delete(path);
      }
      this.dirty.clear();
    }
    this.timing[wasFull ? "build" : "update"] = performance.now() - started;
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
