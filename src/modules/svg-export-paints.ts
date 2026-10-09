const PAINT_PROPERTIES = ['fill', 'stroke', 'color', 'background-color', 'outline-color', 'rx', 'ry'];

export async function snapshotSvgPaints(root, checkpoint) {
  const snapshot = new Map();
  const svgs = [...root.querySelectorAll('svg')].filter(svg => !svg.parentElement?.closest('svg'));
  for (let index = 0; index < svgs.length; index++) {
    const stack = [{ node:svgs[index], path:String(index) }];
    while (stack.length) {
      await checkpoint();
      const { node, path } = stack.pop();
      const style = getComputedStyle(node), key = `${path}|${node.tagName}|${node.getAttribute('class') || ''}`;
      snapshot.set(key, { node, values:Object.fromEntries(PAINT_PROPERTIES.map(name => [name, style.getPropertyValue(name).trim()])) });
      [...node.children].forEach((child, childIndex) => stack.push({node:child,path:`${path}/${childIndex}`}));
    }
  }
  return snapshot;
}

// A light RGB value can serve several roles with different dark equivalents.
// Match by element/property, then deduplicate identical light/dark pairs.
export function svgPaintTokens(lightSnapshot, darkSnapshot, lightValues, darkValues) {
  const paints = new WeakMap(), pairs = new Map();
  for (const [key, light] of lightSnapshot) {
    const dark = darkSnapshot.get(key);
    if (!dark) continue;
    const properties = new Map();
    for (const name of PAINT_PROPERTIES) {
      const first = light.values[name], second = dark.values[name];
      if (!first || !second || first === second) continue;
      const pair = JSON.stringify([first, second]);
      let token = pairs.get(pair);
      if (!token) {
        token = `--ib-svg-paint-${pairs.size + 1}`; pairs.set(pair, token);
        lightValues[token] = first; darkValues[token] = second;
      }
      properties.set(name, token);
    }
    if (properties.size) paints.set(light.node, properties);
  }
  return paints;
}
