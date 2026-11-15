/* One wheel-zoom step for every chart and diagram: a mouse notch (deltaY about 100) is 3%, a trackpad pinch
   (many small deltas) is proportionally smaller. Capped so a fast spin cannot jump the view away. */
const PER_DELTA = 0.0008;
const MAX_STEP = 0.03;

/** Fraction to add or remove for one wheel event. */
export function wheelZoomStep(deltaY: number): number {
  return Math.min(MAX_STEP, Math.abs(deltaY) * PER_DELTA);
}

/** Multiplier for one wheel event: above 1 when scrolling up (zoom in), below 1 when scrolling down. */
export function wheelZoomFactor(deltaY: number): number {
  const step = wheelZoomStep(deltaY);
  return deltaY < 0 ? 1 + step : 1 - step;
}
