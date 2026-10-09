// Native preview sections stay owned by Obsidian. The card layer is purely
// visual; resizing and virtual section insertion update it without reparenting.
export function createNativeChapterCards() {
  const states = new Map<HTMLElement, any>();
  const pending = new Set<HTMLElement>();
  let frame = 0;
  let destroyed = false;
  const schedule = () => {
    if (frame || destroyed) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const element of pending) {
        const root = element.closest<HTMLElement>(".markdown-reading-view .markdown-preview-sizer");
        if (root) ensure(root);
      }
      pending.clear();
      for (const [root, state] of states) {
        if (!root.isConnected) { state.dispose(); states.delete(root); continue; }
        if (state.layer.parentElement !== root) root.appendChild(state.layer);
        draw(root, state.layer);
      }
    });
  };
  const draw = (root: HTMLElement, layer: HTMLElement) => {
    if (!root.checkVisibility() || root.closest(".ibp-has-book")) { layer.replaceChildren(); return; }
    const origin = root.getBoundingClientRect();
    const groups = new Map<string, { top: number; bottom: number; left: number; right: number; tone: string; starts: boolean }>();
    for (const child of [...root.children] as HTMLElement[]) {
      const chapter = child.dataset.ibNativeChapter;
      if (chapter === undefined) continue;
      const r = child.getBoundingClientRect();
      if (!r.height) continue;
      const group = groups.get(chapter);
      if (group) { group.top = Math.min(group.top, r.top); group.bottom = Math.max(group.bottom, r.bottom); group.starts ||= child.hasAttribute("data-ib-native-chapter-start"); }
      else groups.set(chapter, { top:r.top, bottom:r.bottom, left:r.left, right:r.right, tone:child.dataset.ibNativeChapterTone || "0", starts:child.hasAttribute("data-ib-native-chapter-start") });
    }
    const fragment = root.ownerDocument.createDocumentFragment();
    for (const [chapter, group] of groups) {
      const card = root.ownerDocument.createElement("div");
      card.className = "ibc-container ibc-container--chapter ib-native-chapter-card";
      card.dataset.ibNativeCard = chapter;
      card.dataset.ibcTone = group.tone;
      card.setAttribute("aria-hidden", "true");
      Object.assign(card.style, { position:"absolute", padding:"0", margin:"0", top:`${group.top-origin.top}px`, left:`${group.left-origin.left}px`, width:`${group.right-group.left}px`, height:`${group.bottom-group.top}px` });
      if (group.starts) {
        const rail = root.ownerDocument.createElement("span");
        rail.className = "ibc-chapter__rail";
        card.appendChild(rail);
      }
      fragment.appendChild(card);
    }
    layer.replaceChildren(fragment);
  };
  const ensure = (root: HTMLElement) => {
    if (states.has(root)) return;
    root.classList.add("ib-native-chapters");
    const layer = root.ownerDocument.createElement("div");
    layer.className = "ib-native-chapter-layer";
    layer.setAttribute("aria-hidden", "true");
    root.appendChild(layer);
    const observer = new MutationObserver(records => {
      if (records.some(r => r.removedNodes.length || [...r.addedNodes].some(node => node !== layer))) schedule();
    });
    observer.observe(root, {childList:true});
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const dispose = () => { observer.disconnect(); resize.disconnect(); layer.remove(); root.classList.remove("ib-native-chapters"); };
    states.set(root, { layer, dispose });
  };
  return {
    update(element: HTMLElement) { pending.add(element); schedule(); },
    destroy() { destroyed = true; cancelAnimationFrame(frame); pending.clear(); for (const state of states.values()) state.dispose(); states.clear(); }
  };
}
