// Node geometry is measured after ECharts has laid out the graph, in chart pixels.
export function graphPixelBounds(chart, seriesIndex: number) {
  const model = chart.getModel().getSeriesByIndex(seriesIndex);
  if (model?.subType !== "graph") return null;
  const data = model.getData(), points = [];
  for (let index = 0; index < data.count(); index++) {
    const layout = data.getItemLayout(index);
    if (!Array.isArray(layout)) continue;
    const point = chart.convertToPixel({ seriesIndex }, layout);
    if (!Array.isArray(point) || !point.every(Number.isFinite)) continue;
    const symbol = data.getItemVisual(index, "symbolSize") ?? model.get("symbolSize") ?? 10;
    const size = Array.isArray(symbol) ? symbol : [symbol, symbol];
    const transform = data.getItemGraphicEl?.(index)?.getComputedTransform?.();
    const scaleX = transform ? Math.hypot(transform[0], transform[1]) : 1;
    const scaleY = transform ? Math.hypot(transform[2], transform[3]) : 1;
    const halfWidth = Number(size[0]) * scaleX / 2, halfHeight = Number(size[1]) * scaleY / 2;
    points.push({ x: point[0], y: point[1], halfWidth, halfHeight });
  }
  if (points.length < 2) return null;
  const left = Math.min(...points.map(point => point.x - point.halfWidth));
  const right = Math.max(...points.map(point => point.x + point.halfWidth));
  const top = Math.min(...points.map(point => point.y - point.halfHeight));
  const bottom = Math.max(...points.map(point => point.y + point.halfHeight));
  const width = right - left, height = bottom - top;
  return { count: points.length, left, right, top, bottom, width, height,
    chartWidth: chart.getWidth(), chartHeight: chart.getHeight(),
    ratio: width * height / (chart.getWidth() * chart.getHeight()),
    zoom: model.get("zoom"), center: model.get("center"), roam: model.get("roam"),
    label: model.get("label"), force: model.get("force") };
}

export function fitDefaultGraph(chart, authored, seriesIndex: number) {
  if (authored?.type !== "graph") return null;
  const bounds = graphPixelBounds(chart, seriesIndex);
  if (!bounds || bounds.ratio <= 0) return bounds;
  const centerX = (bounds.left + bounds.right) / 2, centerY = (bounds.top + bounds.bottom) / 2;
  const hasZoom = Object.prototype.hasOwnProperty.call(authored, "zoom");
  const hasCenter = Object.prototype.hasOwnProperty.call(authored, "center");
  if (hasZoom && hasCenter) return bounds;
  // graphRoam updates the series' zoom/center without restarting the force solver.
  const currentZoom = Number(bounds.zoom || 1);
  const requested = bounds.ratio < .55 ? Math.min(3, .8 / bounds.ratio) : currentZoom;
  const contained = Math.min(requested, currentZoom * (chart.getWidth() - 64) / bounds.width,
    currentZoom * (chart.getHeight() - 32) / bounds.height);
  chart.dispatchAction({ type: "graphRoam", seriesIndex,
    zoom: hasZoom ? 1 : contained / currentZoom,
    originX: hasCenter ? chart.getWidth() / 2 : centerX, originY: hasCenter ? chart.getHeight() / 2 : centerY,
    dx: hasCenter ? 0 : chart.getWidth() / 2 - centerX,
    dy: hasCenter ? 0 : chart.getHeight() / 2 - centerY });
  // Roam's coordinate round-trip can introduce floating point changes to
  // an authored center. Retain its exact representation in the series model.
  if (hasCenter) chart.getModel().getSeriesByIndex(seriesIndex).option.center = structuredClone(authored.center);
  return graphPixelBounds(chart, seriesIndex);
}
