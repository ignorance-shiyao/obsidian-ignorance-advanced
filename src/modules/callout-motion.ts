/* 原生折叠会动画尺寸；主题限制属性，插件只协调用户触发的状态。 */
export function installCalloutMotion(plugin) {
  const states = new Map<HTMLElement, { originalCollapsed: boolean; originalDisplay: string; timer?: ReturnType<typeof setTimeout> }>();
  const clearMotion = (content: HTMLElement) => {
    content.classList.remove("ib-callout-opening", "ib-callout-closing");
    content.style.removeProperty("--ib-callout-opacity");
  };
  plugin.registerDomEvent(document, "click", event => {
    if (event.button !== 0 || event.defaultPrevented || !(event.target instanceof Element)) return;
    const title = event.target.closest(".callout.is-collapsible > .callout-title");
    if (!title || event.target.closest("a, button, input, textarea, select") || title.closest(".ibp-book, .ibp-staging, .ibp-export, .ibp-export-preview__book, .ibp-export-preview__slides")) return;
    const callout = title.parentElement as HTMLElement;
    const content = callout.querySelector(":scope > .callout-content") as HTMLElement;
    if (!content) return;
    // 阻止原生处理器写入高度/边距动画；保留其初始折叠状态供卸载恢复。
    event.preventDefault(); event.stopImmediatePropagation();
    let state = states.get(callout);
    if (!state) { state = { originalCollapsed: callout.classList.contains("is-collapsed"), originalDisplay: content.style.display }; states.set(callout, state); }
    clearTimeout(state.timer);
    const wasCollapsed = callout.classList.contains("is-collapsed");
    const opacity = content.checkVisibility() ? getComputedStyle(content).opacity : "0";
    clearMotion(content); content.style.removeProperty("display");
    callout.classList.toggle("is-collapsed", !wasCollapsed);
    title.querySelector(".callout-fold")?.classList.toggle("is-collapsed", !wasCollapsed);
    const value = getComputedStyle(content).getPropertyValue("--ib-dur-base").trim();
    const duration = value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !Number.isFinite(duration) || duration <= 0) return;
    content.style.setProperty("--ib-callout-opacity", opacity);
    content.classList.add(wasCollapsed ? "ib-callout-opening" : "ib-callout-closing");
    state.timer = setTimeout(() => clearMotion(content), duration);
  }, { capture: true });
  plugin.register(() => {
    for (const [callout, state] of states) {
      clearTimeout(state.timer);
      const content = callout.querySelector(":scope > .callout-content") as HTMLElement;
      if (content) { clearMotion(content); content.style.display = state.originalDisplay; }
      callout.classList.toggle("is-collapsed", state.originalCollapsed);
      callout.querySelector(":scope > .callout-title > .callout-fold")?.classList.toggle("is-collapsed", state.originalCollapsed);
    }
    states.clear();
  });
}
