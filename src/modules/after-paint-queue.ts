// Defer DOM measurement until Chromium has painted the inserted content.
// The slice of a window the queue schedules with (a test can pass a fake clock).
export interface PaintScheduler {
  requestAnimationFrame(callback: () => void): number;
  cancelAnimationFrame(id: number): void;
  setTimeout(callback: () => void, delay?: number): number;
  clearTimeout(id: number): void;
}

export function createAfterPaintQueue<T extends { isConnected: boolean }>(
  run: (element: T) => void,
  win: PaintScheduler = window,
  onError: (error: unknown) => void = error => console.warn("Ignorance Advanced: deferred enhancement", error)
) {
  const pending = new Map<T, { frame: number; timer: number }>();
  const enqueue = (element: T) => {
    if (pending.has(element)) return;
    const job = { frame: 0, timer: 0 };
    pending.set(element, job);
    job.frame = win.requestAnimationFrame(() => {
      job.frame = 0;
      job.timer = win.setTimeout(() => {
        try { if (element.isConnected) run(element); }
        catch (error) { onError(error); }
        finally { pending.delete(element); }
      }, 0);
    });
  };
  const clear = () => {
    for (const job of pending.values()) {
      if (job.frame) win.cancelAnimationFrame(job.frame);
      if (job.timer) win.clearTimeout(job.timer);
    }
    pending.clear();
  };
  return { enqueue, has: (element: T) => pending.has(element), clear };
}
