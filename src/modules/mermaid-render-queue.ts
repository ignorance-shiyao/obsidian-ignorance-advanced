/* Mermaid uses shared DOM ids while drawing, so keep one render in flight.
   Obsidian passes a hidden scratch div rather than the real note block. Match
   the pending source block once and recheck its position before each draw. */
export function mermaidRenderTargets(document, text, container) {
  const targets = new Set();
  if (container?.parentElement !== document.body && container?.getBoundingClientRect) targets.add(container);
  if (typeof text === "string") {
    const source = text.trim();
    for (const code of document.querySelectorAll("pre > code.language-mermaid")) {
      if (code.textContent?.trim() === source) targets.add(code.parentElement);
    }
  }
  return targets;
}

export function mermaidTargetPriority(targets, document) {
  let best = Infinity;
  const win = document.defaultView;
  for (const target of targets) {
    if (!target?.isConnected || !target.getClientRects().length) continue;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    let top = 0, bottom = win.innerHeight, left = 0, right = win.innerWidth;
    // Clip to scrollable ancestors, including a hidden reading view beneath
    // the paged book. offsetParent alone cannot detect visibility:hidden.
    let hidden = false;
    for (let node = target; node && node !== document.body; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") { hidden = true; break; }
      if (/(auto|scroll|hidden|clip)/.test(`${style.overflowX} ${style.overflowY}`)) {
        const box = node.getBoundingClientRect();
        top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom);
        left = Math.max(left, box.left); right = Math.min(right, box.right);
      }
    }
    if (hidden || bottom <= top || right <= left) continue;
    if (rect.bottom > top && rect.top < bottom && rect.right > left && rect.left < right) return 0;
    // Visible notes' nearby blocks outrank detached/background render jobs.
    best = Math.min(best, 1 + Math.max(top - rect.bottom, rect.top - bottom, left - rect.right, rect.left - right, 0));
  }
  return best;
}

export function createMermaidRenderQueue(draw, {
  document = globalThis.document,
  yieldToMain = () => new Promise(resolve => document.defaultView.setTimeout(resolve, 0)),
  targetsFor = (text, container) => mermaidRenderTargets(document, text, container),
  priorityFor = targets => mermaidTargetPriority(targets, document),
  isDark = () => document.body.classList.contains("theme-dark")
} = {}) {
  const cache = new Map();
  const pending = [];
  const inflight = new Map();
  let running = false;
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (pending.length) {
        await yieldToMain();
        // Recompute after yielding: the reader may have jumped or switched
        // tabs since these jobs entered the queue. Equal priorities stay FIFO.
        let index = 0, best = priorityFor(pending[0].targets);
        for (let i = 1; i < pending.length; i++) {
          const priority = priorityFor(pending[i].targets);
          if (priority < best) { best = priority; index = i; }
        }
        const job = pending.splice(index, 1)[0];
        try {
          const result = await draw(...job.args);
          if (typeof result?.svg === "string" && result.svg.length < 250000 && !/\bclick\s/i.test(job.args[1])) {
            cache.set(job.key, { ...result, id: job.args[0] });
            while (cache.size > 64) cache.delete(cache.keys().next().value);
          }
          // Obsidian inserts and enhances the returned SVG in its promise
          // continuation. Do not combine that layout with Mermaid's draw task.
          await yieldToMain();
          job.resolve(result);
        }
        catch (error) { job.reject(error); }
      }
    } finally { running = false; }
  };
  return (id, text, container, ...rest) => {
    const key = `${container?.style?.width || ""}\n${isDark()}\n${document?.body?.dataset?.ibThemeStamp || ""}\n${typeof text === "string" ? text.trim() : text}`;
    const cached = cache.get(key);
    if (cached) { cache.delete(key); cache.set(key, cached); const { id: originalId, ...result } = cached; return Promise.resolve({ ...result, svg: result.svg.split(originalId).join(id) }); }
    const targets = targetsFor(text, container);
    const shared = typeof text === "string" && inflight.get(key);
    if (shared) {
      for (const target of targets) shared.targets.add(target);
      return shared.promise.then(result => typeof result?.svg === "string"
        ? { ...result, svg: result.svg.split(shared.id).join(id) }
        : result);
    }
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    pending.push({ key, args: [id, text, container, ...rest], targets, resolve, reject });
    if (typeof text === "string") {
      inflight.set(key, { id, promise, targets });
      const release = () => { if (inflight.get(key)?.promise === promise) inflight.delete(key); };
      promise.then(release, release);
    }
    void drain();
    return promise;
  };
}
