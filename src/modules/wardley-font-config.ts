// Mermaid's directive schema omits wardley-beta, although its renderer reads
// this key. Preserve the two supported font options during the private draw.
type ConfigParser = (text: string) => unknown;
type DrawFunction = (this: unknown, ...args: unknown[]) => unknown;

// The slice of the Mermaid engine this file touches: the renderer of a parsed diagram and the global config.
interface WardleyEngine {
  mermaidAPI?: {
    getDiagramFromText?(text: string): Promise<unknown>;
    getConfig?(): Record<string, unknown>;
    setConfig?(config: Record<string, unknown>): void;
  };
}

export function wardleyFontOptions(source: string, parse: ConfigParser): Record<string, number> {
  const configs: unknown[] = [];
  for (const match of source.matchAll(/%%\{\s*(?:init|initialize)\s*:\s*([\s\S]*?)\}%%/g)) {
    try { configs.push(parse(match[1])); } catch { /* Mermaid reports invalid source. */ }
  }
  const frontmatter = /^\s*---\s*\n([\s\S]*?)\n---\s*\n/.exec(source);
  if (frontmatter) {
    try { configs.push((parse(frontmatter[1]) as { config?: unknown } | null)?.config); } catch { /* Mermaid reports invalid frontmatter. */ }
  }
  const options: Record<string, number> = {};
  for (const config of configs) {
    for (const key of ['labelFontSize', 'axisFontSize']) {
      const value = (config as Record<string, Record<string, unknown> | undefined> | null)?.['wardley-beta']?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) options[key] = value;
    }
  }
  return options;
}

export async function withWardleyFontConfig<T>(engine: WardleyEngine, source: string, draw: () => Promise<T>, parse: ConfigParser): Promise<T> {
  if (!/^\s*wardley-beta\b/m.test(source)) return draw();
  const options = wardleyFontOptions(source, parse);
  if (!Object.keys(options).length) return draw();
  const api = engine.mermaidAPI;
  let renderer: { draw?: DrawFunction } | undefined, original: DrawFunction | undefined;
  try {
    renderer = ((await api.getDiagramFromText(source)) as { renderer?: { draw?: DrawFunction } } | undefined)?.renderer;
    original = renderer?.draw;
    if (typeof original !== 'function' || typeof api.setConfig !== 'function') return draw();
  } catch { return draw(); }
  const adapted = async function(this: unknown, ...args: unknown[]): Promise<unknown> {
    const previous = api.getConfig();
    api.setConfig({ 'wardley-beta': options });
    try {
      const result: unknown = await original.apply(this, args);
      return result;
    }
    finally { api.setConfig(previous); }
  };
  renderer.draw = adapted;
  try { return await draw(); }
  finally { if (renderer.draw === adapted) renderer.draw = original; }
}
