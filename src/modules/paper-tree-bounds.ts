/** TreeView may bypass diagram enhancement; its renderer bounds precede theme fonts. */
export function fitPaperTreeBounds(root: HTMLElement) {
  root.querySelectorAll<SVGSVGElement>('svg[aria-roledescription="treeView"]').forEach(svg => {
    const tree = svg.querySelector<SVGGraphicsElement>('g.tree-view');
    if (!tree) return;
    const bounds = tree.getBBox();
    if (!Number.isFinite(bounds.width) || bounds.width <= 0 || bounds.height <= 0) return;
    const padding = 6;
    svg.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${bounds.width + padding * 2} ${bounds.height + padding * 2}`);
    svg.style.setProperty('width', `${Math.ceil(bounds.width + padding * 2)}px`, 'important');
    svg.style.setProperty('height', `${Math.ceil(bounds.height + padding * 2)}px`, 'important');
  });
}
