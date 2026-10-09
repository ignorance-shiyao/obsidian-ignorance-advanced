// Test the actual segment rather than its bounding rectangle: diagonal links
// leave substantial usable space on either side.
export function segmentCrossesBox(segment, box, gap = 0) {
  const left = box.x - gap, right = box.x + box.width + gap;
  const top = box.y - gap, bottom = box.y + box.height + gap;
  const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
  let enter = 0, exit = 1;
  for (const [p, q] of [[-dx, segment.x1-left], [dx, right-segment.x1], [-dy, segment.y1-top], [dy, bottom-segment.y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const ratio = q / p;
    if (p < 0) enter = Math.max(enter, ratio); else exit = Math.min(exit, ratio);
    if (enter > exit) return false;
  }
  return true;
}

export function wardleyNotePosition(label, obstacles, segments, bounds, gap = 8) {
  const fits = box => box.x >= bounds.x && box.y >= bounds.y && box.x + box.width <= bounds.x + bounds.width && box.y + box.height <= bounds.y + bounds.height
    && !obstacles.some(node => box.x < node.x + node.width + gap && box.x + box.width > node.x - gap && box.y < node.y + node.height + gap && box.y + box.height > node.y - gap)
    && !segments.some(segment => segmentCrossesBox(segment, box, gap));
  if (fits(label)) return label;
  const maxX = bounds.x + bounds.width - label.width, maxY = bounds.y + bounds.height - label.height;
  if (maxX < bounds.x || maxY < bounds.y) return null;
  const xs = new Set([Math.max(bounds.x, Math.min(label.x, maxX)), bounds.x, maxX]);
  const ys = new Set([Math.max(bounds.y, Math.min(label.y, maxY)), bounds.y, maxY]);
  for (const node of obstacles) {
    xs.add(node.x-gap-label.width); xs.add(node.x+node.width+gap);
    ys.add(node.y-gap-label.height); ys.add(node.y+node.height+gap);
  }
  for (let x = bounds.x; x <= maxX; x += Math.max(24, bounds.width / 32)) xs.add(x);
  for (let y = bounds.y; y <= maxY; y += Math.max(24, bounds.height / 32)) ys.add(y);
  const candidates = [...xs].filter(x=>x>=bounds.x&&x<=maxX).flatMap(x=>[...ys].filter(y=>y>=bounds.y&&y<=maxY).map(y=>({...label,x,y})))
    .sort((a,b)=>(a.x-label.x)**2+(a.y-label.y)**2-((b.x-label.x)**2+(b.y-label.y)**2));
  return candidates.find(fits) || null;
}
