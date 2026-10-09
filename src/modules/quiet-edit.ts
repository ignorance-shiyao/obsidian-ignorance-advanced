// Source edits made from a block's own controls (position, alignment) must not move the page.
// Obsidian's editor.replaceRange makes CodeMirror scroll the cursor into view, so a block adjusted
// far from the cursor threw the reader back to it, and saving re-renders the note on top of that.

// Rewrites a range without letting CodeMirror scroll the cursor into view.
export function replaceOffsetsQuietly(cm, from: number, to: number, insert: string) {
  cm.dispatch({ changes: { from, to, insert }, scrollIntoView: false, userEvent: "input.ib-block" });
}

export function replaceRangeQuietly(editor, from: { line: number; ch: number }, to: { line: number; ch: number }, text: string) {
  const cm = editor.cm;
  if (cm?.state?.doc && typeof editor.posToOffset === "function") {
    replaceOffsetsQuietly(cm, editor.posToOffset(from), editor.posToOffset(to), text);
  } else editor.replaceRange(text, from, to);
}

export function replaceLineQuietly(editor, line: number, text: string) {
  replaceRangeQuietly(editor, { line, ch: 0 }, { line, ch: editor.getLine(line).length }, text);
}

// A save re-renders the note, which can reset or shift the scroller. Keep the position the reader
// had until the render settles, unless they scroll, type or press something themselves.
export function holdScrollPosition(from: HTMLElement, duration = 1500) {
  const scroller = from.closest(".cm-scroller, .markdown-preview-view") as HTMLElement | null;
  if (!scroller) return () => {};
  const doc = scroller.ownerDocument, top = scroller.scrollTop, events = ["wheel", "touchstart", "keydown", "pointerdown"];
  const until = performance.now() + duration;
  let frame = 0, done = false;
  const release = () => {
    if (done) return;
    done = true;
    window.cancelAnimationFrame(frame);
    for (const name of events) doc.removeEventListener(name, release, true);
  };
  for (const name of events) doc.addEventListener(name, release, { capture: true, passive: true });
  const tick = () => {
    if (done) return;
    if (Math.abs(scroller.scrollTop - top) > 2) scroller.scrollTop = top;
    if (performance.now() >= until) release(); else frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return release;
}

// Saving fails with a raw errno when the note is read-only on disk; say what to do instead.
export function saveErrorMessage(error): string {
  const text = String(error?.message || error);
  if (/EACCES|EPERM|EROFS/.test(text)) return "文件在磁盘上是只读的，请先解除只读（访达 → 显示简介 → 取消“已锁定”或修改权限）";
  return text;
}

// Clicking a rendered block (diagram, container, table…) to edit its source swaps the widget for
// source lines of a different height, and the editor then scrolls the caret into view. Keep the
// block's first line where the block's top was, so the page does not jump under the pointer.
export function anchorBlockTop(cm, block: HTMLElement, duration = 700) {
  let pos: number, top: number;
  try { pos = cm.posAtDOM(block); } catch (_) { return () => {}; }
  top = block.getBoundingClientRect().top;
  const scroller = cm.scrollDOM as HTMLElement, doc = scroller.ownerDocument, events = ["wheel", "touchstart", "keydown"];
  const until = performance.now() + duration;
  let frame = 0, done = false, settled = 0;
  const stop = () => {
    if (done) return;
    done = true;
    window.cancelAnimationFrame(frame);
    for (const name of events) doc.removeEventListener(name, stop, true);
  };
  for (const name of events) doc.addEventListener(name, stop, { capture: true, passive: true });
  const tick = () => {
    if (done) return;
    const coords = cm.coordsAtPos(pos);
    const delta = coords ? coords.top - top : 0;
    if (Math.abs(delta) > 1) { scroller.scrollTop += delta; settled = 0; }
    else if (++settled > 20) return stop();
    if (performance.now() >= until) stop(); else frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return stop;
}
