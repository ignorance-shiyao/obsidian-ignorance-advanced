// Mermaid's directive schema omits wardley-beta, although its renderer reads
// this key. Preserve the two supported font options during the private draw.
export function wardleyFontOptions(source, parse) {
  const configs = [];
  for (const match of source.matchAll(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}%%/g)) {
    try { configs.push(parse(match[1])); } catch (_) { /* Mermaid reports invalid source. */ }
  }
  const frontmatter = /^\s*---\s*\n([\s\S]*?)\n---\s*\n/.exec(source);
  if (frontmatter) { try { configs.push(parse(frontmatter[1])?.config); } catch (_) {} }
  const options = {};
  for (const config of configs) {
    for (const key of ['labelFontSize', 'axisFontSize']) {
      const value = config?.['wardley-beta']?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) options[key] = value;
    }
  }
  return options;
}

export async function withWardleyFontConfig(engine, source, draw, parse) {
  if (!/^\s*wardley-beta\b/m.test(source)) return draw();
  const options = wardleyFontOptions(source, parse);
  if (!Object.keys(options).length) return draw();
  const api = engine.mermaidAPI;
  let renderer, original;
  try {
    renderer = (await api.getDiagramFromText(source))?.renderer;
    original = renderer?.draw;
    if (typeof original !== 'function' || typeof api.setConfig !== 'function') return draw();
  } catch (_) { return draw(); }
  const adapted = async function(...args) {
    const previous = api.getConfig();
    api.setConfig({ 'wardley-beta': options });
    try { return await original.apply(this, args); }
    finally { api.setConfig(previous); }
  };
  renderer.draw = adapted;
  try { return await draw(); }
  finally { if (renderer.draw === adapted) renderer.draw = original; }
}
