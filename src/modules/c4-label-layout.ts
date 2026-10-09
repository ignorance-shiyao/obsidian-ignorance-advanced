export function avoidC4LabelNodes(label, obstacles, bounds, gap = 8) {
  const overlaps = box => obstacles.some(node => box.x < node.x + node.width + gap && box.x + box.width > node.x - gap && box.y < node.y + node.height + gap && box.y + box.height > node.y - gap);
  if (!overlaps(label)) return { dx: 0, dy: 0 };
  const xs = [label.x], ys = [label.y];
  for (const node of obstacles) {
    xs.push(node.x - gap - label.width, node.x + node.width + gap);
    ys.push(node.y - gap - label.height, node.y + node.height + gap);
  }
  const candidates = xs.flatMap(x => ys.map(y => ({ ...label, x, y })))
    .filter(box => box.x >= bounds.x && box.y >= bounds.y && box.x + box.width <= bounds.x + bounds.width && box.y + box.height <= bounds.y + bounds.height && !overlaps(box))
    .sort((a, b) => Math.hypot(a.x - label.x, a.y - label.y) - Math.hypot(b.x - label.x, b.y - label.y));
  const target = candidates[0];
  return target ? { dx: target.x - label.x, dy: target.y - label.y } : { dx: 0, dy: 0 };
}
