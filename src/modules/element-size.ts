// ResizeObserver already supplies layout geometry. Reading clientWidth in its
// callback forces another layout when other charts have just changed styles.
export function observedSize(entry: { contentRect: { width: number; height: number } }) {
  return { width:Math.round(entry.contentRect.width), height:Math.round(entry.contentRect.height) };
}

/* The window pieces waitForSize uses; a popout window or a test double can stand in. */
export interface SizeEntry {
  target: unknown;
  contentRect: { width: number; height: number };
}

export interface SizeEnvironment {
  ResizeObserver: new (callback: (entries: SizeEntry[]) => void) => { observe(element: unknown): void; disconnect(): void };
  setTimeout(handler: () => void, timeout?: number): number;
  clearTimeout(id: number): void;
}

export function waitForSize(element: object, timeout = 1800, environment: SizeEnvironment = window) {
  return new Promise<{ width: number; height: number } | null>(resolve => {
    let finished = false, timer = 0;
    const finish = (size: { width: number; height: number } | null = null) => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      environment.clearTimeout(timer);
      resolve(size);
    };
    const observer = new environment.ResizeObserver(entries => {
      const entry = entries.find(entry => entry.target === element);
      if (!entry) return;
      const size = observedSize(entry);
      if (size.width > 0 && size.height > 0) finish(size);
    });
    timer = environment.setTimeout(() => finish(), timeout);
    observer.observe(element);
  });
}
