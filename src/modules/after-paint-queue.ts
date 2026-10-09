// Defer DOM measurement until Chromium has painted the inserted content.
export function createAfterPaintQueue(run, win = window, onError = error => console.warn("Ignorance Advanced: deferred enhancement", error)) {
  const pending = new Map();
  const enqueue = element => {
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
  return { enqueue, has: element => pending.has(element), clear };
}
