/* Sample real layout on rendered frames instead of imposing a fixed delay. */
export async function waitForStableLayout(read: () => number, {
  frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
  signal = undefined as AbortSignal | undefined,
  frames = 120,
  stableFrames = 2
} = {}) {
  signal?.throwIfAborted();
  let previous = read(), stable = 0;
  for (let index = 0; index < frames; index++) {
    await frame(); signal?.throwIfAborted();
    const current = read();
    stable = Math.abs(current - previous) < 1 ? stable + 1 : 0;
    previous = current;
    if (stable >= stableFrames) return true;
  }
  return false;
}
