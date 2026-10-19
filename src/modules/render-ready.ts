/* "Has this rendered note finished?" — instead of a fixed pause. Embeds, diagrams and charts finish after the
   first render pass, at a speed that depends on the machine; a fixed wait either wastes time or cuts content.
   Settled means: the DOM stopped changing for a quiet period, and every image has loaded. A ceiling stops a block
   that never settles (a chart that failed) from hanging the export; the caller is told it was hit. */

export interface SettleState { now: number; lastChange: number; started: number; quiet: number; ceiling: number; pendingImages: number }

/** "ready" when settled, "ceiling" when the time limit was reached first, null while still waiting. */
export function settleVerdict(state: SettleState): "ready" | "ceiling" | null {
  if (state.pendingImages === 0 && state.now - state.lastChange >= state.quiet) return "ready";
  if (state.now - state.started >= state.ceiling) return "ceiling";
  return null;
}

export interface SettleOptions { quiet?: number; ceiling?: number }

export function waitUntilSettled(root: HTMLElement, options: SettleOptions = {}): Promise<"ready" | "ceiling"> {
  const quiet = options.quiet ?? 250, ceiling = options.ceiling ?? 10000;
  return new Promise(resolve => {
    const started = performance.now();
    let lastChange = started;
    const observer = new MutationObserver(() => { lastChange = performance.now(); });
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      const pendingImages = Array.from(root.querySelectorAll("img")).filter(image => !image.complete).length;
      const verdict = settleVerdict({ now: performance.now(), lastChange, started, quiet, ceiling, pendingImages });
      if (verdict) { observer.disconnect(); resolve(verdict); return; }
      window.setTimeout(tick, 50);
    };
    window.setTimeout(tick, 50);
  });
}
