/** Viewport rectangles include CSS zoom; inline dimensions and scroll offsets do not. */
export function controlScale(element: Element): number {
  let scale = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const zoom = getComputedStyle(node).getPropertyValue("zoom");
    const value = parseFloat(zoom) / (zoom.endsWith("%") ? 100 : 1);
    if (Number.isFinite(value) && value > 0) scale *= value;
  }
  return scale;
}

/** Position an absolute overlay in its containing block's padding box. */
export function controlBox(element: HTMLElement, host: HTMLElement) {
  const rect = element.getBoundingClientRect(), origin = host.getBoundingClientRect();
  const scale = controlScale(host);
  return {
    left: (rect.left - origin.left) / scale - host.clientLeft + host.scrollLeft,
    top: (rect.top - origin.top) / scale - host.clientTop + host.scrollTop,
    width: rect.width / scale,
    height: rect.height / scale
  };
}
