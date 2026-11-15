/* Full-view of a picture, diagram, table or code block: pan and zoom maths, free of the DOM. The picture is
   drawn with translate(x, y) scale(s) from its top-left corner. */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 8;
export interface View { scale: number; x: number; y: number }

/** The largest scale at which the content fits the stage, never above its own size. */
export function fitScale(contentW: number, contentH: number, stageW: number, stageH: number): number {
  if (contentW <= 0 || contentH <= 0 || stageW <= 0 || stageH <= 0) return 1;
  return Math.min(1, stageW / contentW, stageH / contentH);
}

/** Content centred on the stage at the given scale. */
export function centred(contentW: number, contentH: number, stageW: number, stageH: number, scale: number): View {
  return { scale, x: (stageW - contentW * scale) / 2, y: (stageH - contentH * scale) / 2 };
}

/** Zooms by `factor` keeping the point (cx, cy), in stage coordinates, fixed on the screen. */
export function zoomAt(view: View, factor: number, cx: number, cy: number): View {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: cx - (cx - view.x) * ratio, y: cy - (cy - view.y) * ratio };
}

/** Wheel deltas become a smooth factor; one notch (about 100) is roughly 10%. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.001);
}

/** Next or previous index in the list, stopping at the ends. */
export function neighbour(at: number, count: number, direction: 1 | -1): number {
  return Math.max(0, Math.min(count - 1, at + direction));
}
