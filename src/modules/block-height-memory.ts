// A diagram settles to its real height a few frames after Live Preview inserts it, so a block that
// scrolls into view first reserves a placeholder height and then grows, pushing everything below
// and making the page jump. Remember the settled height per block and reserve it up front next time.
const LIMIT = 400;

// The per-device storage methods of Obsidian's App that this memory uses.
export interface LocalStorageApp {
  loadLocalStorage?(key: string): unknown;
  saveLocalStorage?(key: string, value: unknown): void;
}

export class BlockHeightMemory {
  private map = new Map<string, number>();
  private timer = 0;
  constructor(private app: LocalStorageApp | undefined, private name: string) {
    try {
      const raw: unknown = app?.loadLocalStorage?.(name);
      if (typeof raw === "string" && raw) for (const [key, value] of JSON.parse(raw) as [string, unknown][]) if (typeof value === "number") this.map.set(key, value);
    } catch { /* a missing or corrupt memory only costs the first layout */ }
  }
  get(key: string) { return this.map.get(key); }
  set(key: string, height: number) {
    height = Math.round(height);
    if (!(height > 0) || this.map.get(key) === height) return;
    this.map.delete(key);
    this.map.set(key, height);
    while (this.map.size > LIMIT) this.map.delete(this.map.keys().next().value as string);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.save(), 1500);
  }
  save() {
    try { this.app?.saveLocalStorage?.(this.name, JSON.stringify([...this.map])); } catch { /* storage may be unavailable; the memory is only a hint */ }
  }
  dispose() { window.clearTimeout(this.timer); this.save(); }
}
