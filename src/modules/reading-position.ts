/* Reading position, kept as a source line so it survives every view:
   - switching Live Preview / source / reading / paged reading lands on the same place;
   - reopening a note later continues where it was left (synced with plugin data).
   Obsidian already maps lines between its own modes; the paged book is ours,
   so there the line is resolved through the note's headings. */
import { nextFrame } from "./export.js";

const { MarkdownView } = require("obsidian");

const MAX_REMEMBERED = 500;
const tracked = new WeakMap();

function scroller(view) {
  return view.getMode?.() === "preview"
    ? view.containerEl.querySelector(".markdown-reading-view .markdown-preview-view")
    : view.editor?.cm?.scrollDOM;
}

function book(view) {
  const found = view.containerEl.querySelector(".markdown-reading-view .ibp-has-book .ibp-book");
  return found?.childElementCount ? found : null;
}

// The note's headings in source order, with the rendered book headings they match.
function bookHeadings(view, bookEl) {
  const headings = view.app.metadataCache.getFileCache(view.file)?.headings || [];
  const rendered = [...bookEl.querySelectorAll(".ibp-placed:is(h1,h2,h3,h4,h5,h6), .ibp-placed :is(h1,h2,h3,h4,h5,h6)")];
  const seen = new Set();
  const pairs = [];
  let from = 0;
  for (const heading of headings) {
    const index = rendered.findIndex((el, i) => i >= from && !seen.has(el) && el.textContent.trim() === heading.heading.trim());
    if (index === -1) continue;
    seen.add(rendered[index]);
    from = index + 1;
    pairs.push({ line: heading.position.start.line, el: rendered[index] });
  }
  return pairs;
}

export function currentLine(view) {
  const bookEl = view.getMode?.() === "preview" ? book(view) : null;
  if (bookEl) {
    const top = scroller(view).getBoundingClientRect().top + 8;
    const passed = bookHeadings(view, bookEl).filter(pair => pair.el.getBoundingClientRect().top <= top);
    return passed.length ? passed[passed.length - 1].line : 0;
  }
  const line = view.getEphemeralState?.().scroll;
  return typeof line === "number" && isFinite(line) ? line : 0;
}

export function scrollToLine(view, line) {
  const bookEl = view.getMode?.() === "preview" ? book(view) : null;
  if (bookEl) {
    const pairs = bookHeadings(view, bookEl).filter(pair => pair.line <= line + 0.5);
    const target = pairs[pairs.length - 1];
    const box = scroller(view);
    if (!target) { box.scrollTop = 0; return; }
    box.scrollTop += target.el.getBoundingClientRect().top - box.getBoundingClientRect().top - 16;
    return;
  }
  view.setEphemeralState?.({ scroll: line });
}

function remember(plugin, path, line) {
  const positions = plugin.state.readingPositions ||= {};
  delete positions[path];
  if (line < 1) { plugin.saveStoredState(); return; }
  positions[path] = Math.round(line * 100) / 100;
  const keys = Object.keys(positions);
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete positions[key];
  plugin.saveStoredState();
}

// Run `restore` until the paged book (rendered asynchronously) has pages.
async function whenSettled(view, restore) {
  for (let i = 0; i < 60; i += 1) {
    await nextFrame();
    const reading = view.getMode?.() === "preview";
    const pending = reading && view.containerEl.querySelector(".ibp-has-book .ibp-book:not([data-ibp-progress='complete'])");
    if (!pending) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  restore();
}

export function installReadingPosition(plugin) {
  const { workspace } = plugin.app;
  const views = () => workspace.getLeavesOfType("markdown").map(leaf => leaf.view).filter(view => view instanceof MarkdownView && view.file);
  const guardedRenderers = new WeakSet();
  const guardNativeRestore = view => {
    const renderer = view.previewMode?.renderer;
    if (!renderer || guardedRenderers.has(renderer) || typeof renderer.applyScrollDelayed !== "function") return;
    guardedRenderers.add(renderer);
    const original = renderer.applyScrollDelayed;
    // Native restoration can wait for asynchronous sections. A scroll made
    // after that request must win over the position captured before rendering.
    const guarded = function(line, options, done) {
      if (this.applyScroll(line, options)) { done?.(); return; }
      const box = this.previewEl;
      const start = box.scrollTop;
      const path = view.file?.path;
      let superseded = false;
      const onScroll = () => { if (Math.abs(box.scrollTop - start) > 2) superseded = true; };
      box.addEventListener("scroll", onScroll);
      this.onRendered(() => {
        box.removeEventListener("scroll", onScroll);
        if (!superseded && view.file?.path === path && view.getMode?.() === "preview") this.applyScroll(line, options);
        done?.();
      });
    };
    renderer.applyScrollDelayed = guarded;
    plugin.register(() => { if (renderer.applyScrollDelayed === guarded) renderer.applyScrollDelayed = original; });
  };

  // Scrolls are recorded per view (and per file, throttled) while nothing is being restored.
  plugin.registerDomEvent(document, "scroll", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const view = views().find(view => view.containerEl.contains(target) && scroller(view) === target);
    if (!view) return;
    const state = tracked.get(view);
    if (!state || state.restoring || state.path !== view.file.path) return;
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      if (state.restoring || !view.file || state.path !== view.file.path) return;
      state.line = currentLine(view);
      remember(plugin, view.file.path, state.line);
    }, 300);
  }, true);

  // A pending asynchronous restore must not override a newer user action.
  for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) plugin.registerDomEvent(document, type, event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const view = views().find(view => view.containerEl.contains(target));
    const state = view && tracked.get(view);
    if (!state) return;
    state.restoreGeneration = (state.restoreGeneration || 0) + 1;
    state.restoring = false;
  }, true);

  const restoreTo = (view, state, line) => {
    const generation = state.restoreGeneration = (state.restoreGeneration || 0) + 1;
    state.restoring = true;
    whenSettled(view, () => {
      if (tracked.get(view) !== state || state.path !== view.file?.path || generation !== state.restoreGeneration) return;
      scrollToLine(view, line);
      state.line = line;
      window.setTimeout(() => { state.restoring = false; }, 250);
    });
  };

  const sync = () => {
    for (const view of views()) {
      guardNativeRestore(view);
      const mode = `${view.getMode?.()}|${Boolean(view.containerEl.querySelector(".ibp-has-book"))}`;
      const state = tracked.get(view);
      if (!state || state.path !== view.file.path) {
        // A newly opened note: continue from the remembered line unless the
        // opening already went somewhere (a heading link, a search hit…).
        const next = { path: view.file.path, mode, line: 0, restoring: false, timer: 0 };
        tracked.set(view, next);
        const saved = plugin.state.readingPositions?.[view.file.path];
        if (saved) {
          next.restoring = true;
          window.setTimeout(() => {
            if (tracked.get(view) !== next) return;
            if (currentLine(view) > 0.5) { next.restoring = false; next.line = currentLine(view); return; }
            restoreTo(view, next, saved);
          }, 120);
        }
        continue;
      }
      if (state.mode !== mode) {
        state.mode = mode;
        restoreTo(view, state, state.line);
      }
    }
  };

  plugin.registerEvent(workspace.on("file-open", () => window.setTimeout(sync, 0)));
  plugin.registerEvent(workspace.on("layout-change", sync));
  // The paged book appears after layout-change; watch for it too.
  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => { queued = false; sync(); });
  });
  // Only the paged book finishing a render matters; mode switches arrive as layout-change.
  observer.observe(document.body, { subtree: true, attributeFilter: ["data-ibp-progress"] });
  plugin.register(() => observer.disconnect());
  workspace.onLayoutReady(sync);
}

// Keep the viewport still while `change` rewrites the note (e.g. image alignment).
export async function keepViewport(view, change) {
  const state = tracked.get(view);
  const box = scroller(view);
  const top = box?.scrollTop;
  if (state) state.restoring = true;
  await change();
  // Reading view re-renders a moment after the file is written.
  for (let i = 0; i < 40; i += 1) {
    await nextFrame();
    if (box && top !== undefined) box.scrollTop = top;
  }
  if (state) window.setTimeout(() => { state.restoring = false; }, 250);
}
