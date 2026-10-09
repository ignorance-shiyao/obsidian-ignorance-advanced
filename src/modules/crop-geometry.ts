// Pure crop-box geometry for the image cropper (no Obsidian imports, so it can be tested).
export interface Box { x: number; y: number; w: number; h: number }

// Pure geometry, kept apart from the dialog so it can be tested: move or resize a box inside the
// image bounds, optionally holding an aspect ratio.
export function adjustBox(box: Box, handle: string, dx: number, dy: number, bounds: { w: number; h: number }, ratio = 0, min = 16): Box {
  let { x, y, w, h } = box;
  if (handle === "move") {
    return { x: Math.min(Math.max(0, x + dx), bounds.w - w), y: Math.min(Math.max(0, y + dy), bounds.h - h), w, h };
  }
  let left = x, top = y, right = x + w, bottom = y + h;
  if (handle.includes("w")) left = Math.min(Math.max(0, left + dx), right - min);
  if (handle.includes("e")) right = Math.max(Math.min(bounds.w, right + dx), left + min);
  if (handle.includes("n")) top = Math.min(Math.max(0, top + dy), bottom - min);
  if (handle.includes("s")) bottom = Math.max(Math.min(bounds.h, bottom + dy), top + min);
  if (ratio) {
    // Keep the proportion by letting width lead, then fit height inside the bounds.
    let width = right - left, height = width / ratio;
    const horizontal = handle.includes("w") || handle.includes("e"), vertical = handle.includes("n") || handle.includes("s");
    if (vertical && !horizontal) { height = bottom - top; width = height * ratio; }
    const anchorX = handle.includes("w") ? right : left, anchorY = handle.includes("n") ? bottom : top;
    const maxW = handle.includes("w") ? anchorX : bounds.w - anchorX, maxH = handle.includes("n") ? anchorY : bounds.h - anchorY;
    const scale = Math.min(1, maxW / width, maxH / height);
    width *= scale; height *= scale;
    left = handle.includes("w") ? anchorX - width : anchorX; right = left + width;
    top = handle.includes("n") ? anchorY - height : anchorY; bottom = top + height;
    if (!horizontal) { left = x + (w - width) / 2; right = left + width; if (left < 0) { right -= left; left = 0; } if (right > bounds.w) { left -= right - bounds.w; right = bounds.w; } }
    if (!vertical) { top = y + (h - height) / 2; bottom = top + height; if (top < 0) { bottom -= top; top = 0; } if (bottom > bounds.h) { top -= bottom - bounds.h; bottom = bounds.h; } }
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function fitBoxToRatio(box: Box, ratio: number, bounds: { w: number; h: number }): Box {
  if (!ratio) return box;
  let w = box.w, h = w / ratio;
  if (h > bounds.h) { h = bounds.h; w = h * ratio; }
  if (w > bounds.w) { w = bounds.w; h = w / ratio; }
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return { x: Math.min(Math.max(0, cx - w / 2), bounds.w - w), y: Math.min(Math.max(0, cy - h / 2), bounds.h - h), w, h };
}

