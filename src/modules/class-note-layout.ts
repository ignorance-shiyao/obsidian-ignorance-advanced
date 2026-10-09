// Class notes use Mermaid's markdown label renderer, but its default nowrap
// style prevents that renderer from bounding a long annotation's width.
export function compactClassNotes(data, defaultWidth = 240) {
  if (!Array.isArray(data?.nodes)) return data;
  const authored = Number(data.config?.class?.wrappingWidth);
  const width = authored > 0 ? authored : defaultWidth;
  let changed = false;
  const nodes = data.nodes.map(node => {
    if (node.shape !== "note" || node.wrappingWidth > 0 || typeof node.label !== "string" || /<br\b|\n/i.test(node.label)) return node;
    changed = true;
    return { ...node, wrappingWidth: width,
      cssStyles: (node.cssStyles || []).map(style => /^\s*white-space\s*:\s*nowrap\s*;?\s*$/i.test(style) ? "white-space: normal" : style) };
  });
  return changed ? { ...data, nodes } : data;
}

// Classifier styles are installed before Mermaid measures each member label.
// Applying the member font after layout clips HTML labels measured in sans.
export function measureClassMembers(data, font) {
  if (!font || !Array.isArray(data?.nodes)) return data;
  return { ...data, nodes: data.nodes.map(node => {
    if (node.shape !== "classBox" || [...(node.styles || []), ...(node.cssStyles || [])].some(style => /font-family\s*:/i.test(style))) return node;
    return { ...node, ...Object.fromEntries(["members", "methods"].map(key => [key, (node[key] || []).map(member => {
      if (typeof member?.parseClassifier !== "function") return member;
      const clone = Object.assign(Object.create(Object.getPrototypeOf(member)), member);
      clone.parseClassifier = function(...args) {
        const style = member.parseClassifier.apply(this, args);
        return /font-family\s*:/i.test(style) ? style : `${style};font-family: ${font}`;
      };
      return clone;
    })])) };
  }) };
}

export async function withClassNoteLayout(engine, source, draw, memberFont = "") {
  if (!/^\s*classDiagram(?:-v2)?\b/m.test(source)) return draw();
  const preserveLayout = /%%\s*ibm:keep-layout/.test(source) || /["']?layout["']?\s*:/.test(source);
  let proto, original;
  try {
    const diagram = await engine.mermaidAPI?.getDiagramFromText(source);
    if (diagram?.type !== "classDiagram") return draw();
    proto = Object.getPrototypeOf(diagram.db);
    original = proto?.getData;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "getData");
    if (typeof original !== "function" || !descriptor?.writable) return draw();
  } catch (_) { return draw(); }
  // Only the private engine's draw is adapted. Restore even on parse/render
  // errors; authored source and the class database remain unchanged.
  const adapted = function(...args) {
    const data = original.apply(this, args);
    return measureClassMembers(preserveLayout ? data : compactClassNotes(data), memberFont);
  };
  proto.getData = adapted;
  try { return await draw(); }
  finally { if (proto.getData === adapted) proto.getData = original; }
}
