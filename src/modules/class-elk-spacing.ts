// Scope compact spacing to the private engine's current default class render.
// ELK reads these options on the graph, rather than Mermaid's nodeSpacing.
export async function withClassElkSpacing(source, draw, owner = globalThis) {
  const directives = [source.match(/^\s*---[\s\S]*?\n---(?:\n|$)/)?.[0] || '', ...(source.match(/%%\{[\s\S]*?\}%%/g) || [])].join('\n');
  if (!/^\s*classDiagram(?:-v2)?\b/m.test(source) || /%%\s*ibm:keep-layout/.test(source) ||
      /["']?(?:layout|nodeSpacing|rankSpacing|[^\s"']*spacing[^\s"']*)["']?\s*:/i.test(directives)) return draw();
  const original = owner.__ibmElkTune;
  if (typeof original !== 'function') return draw();
  const compact = graph => {
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
