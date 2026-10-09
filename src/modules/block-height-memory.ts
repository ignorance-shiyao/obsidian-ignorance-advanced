// A diagram settles to its real height a few frames after Live Preview inserts it, so a block that
// scrolls into view first reserves a placeholder height and then grows, pushing everything below
// and making the page jump. Remember the settled height per block and reserve it up front next time.
const LIMIT = 400;

export class BlockHeightMemory {
  private map = new Map<string, number>();
  private timer = 0;
  constructor(private app: any, private name: string) {
    try {
      const raw = app?.loadLocalStorage?.(name);
      if (raw) for (const [key, value] of JSON.parse(raw)) if (typeof value === "number") this.map.set(key, value);
    } catch (_) { /* a missing or corrupt memory only costs the first layout */ }
  }
  get(key: string) { return this.map.get(key); }
  set(key: string, height: number) {
    height = Math.round(height);
    if (!(height > 0) || this.map.get(key) === height) return;
    this.map.delete(key);
    this.map.set(key, height);
    while (this.map.size > LIMIT) this.map.delete(this.map.keys().next().value);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.save(), 1500);
  }
  save() {
    try { this.app?.saveLocalStorage?.(this.name, JSON.stringify([...this.map])); } catch (_) {}
  }
  dispose() { window.clearTimeout(this.timer); this.save(); }
}
