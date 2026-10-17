// Scope compact spacing to the private engine's current default class render.
// ELK reads these options on the graph, rather than Mermaid's nodeSpacing.
export interface ElkGraph { layoutOptions?: Record<string, string>; [key: string]: unknown }
export type ElkTune = (graph: ElkGraph) => ElkGraph | undefined;
export interface ElkOwner { __ibmElkTune?: ElkTune }

export async function withClassElkSpacing<T>(source: string, draw: () => T | Promise<T>, owner: ElkOwner = window as Window & ElkOwner): Promise<T> {
  const directives = [source.match(/^\s*---[\s\S]*?\n---(?:\n|$)/)?.[0] || '', ...(source.match(/%%\{[\s\S]*?\}%%/g) || [])].join('\n');
  if (!/^\s*classDiagram(?:-v2)?\b/m.test(source) || /%%\s*ibm:keep-layout/.test(source) ||
      /["']?(?:layout|nodeSpacing|rankSpacing|[^\s"']*spacing[^\s"']*)["']?\s*:/i.test(directives)) return await draw();
  const original = owner.__ibmElkTune;
  if (typeof original !== 'function') return await draw();
  const compact = (graph: ElkGraph): ElkGraph => {
    graph = original(graph) || graph;
    return { ...graph, layoutOptions: { ...graph.layoutOptions,
      'elk.spacing.nodeNode': '28',
      'elk.layered.spacing.nodeNodeBetweenLayers': '28',
      'elk.layered.spacing.edgeNodeBetweenLayers': '14'
    } };
  };
  owner.__ibmElkTune = compact;
  try { return await draw(); }
  finally { if (owner.__ibmElkTune === compact) owner.__ibmElkTune = original; }
}
