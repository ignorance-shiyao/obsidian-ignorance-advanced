// Yield to Chromium's task queue so input and painting can run between batches.
export function renderBudget(signal?, milliseconds = 8) {
  let started = performance.now();
  return async () => {
    signal?.throwIfAborted();
    if (performance.now() - started < milliseconds) return;
    await new Promise(resolve => setTimeout(resolve, 0));
    signal?.throwIfAborted();
    started = performance.now();
  };
}
