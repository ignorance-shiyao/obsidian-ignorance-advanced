// Class notes use Mermaid's markdown label renderer, but its default nowrap
// style prevents that renderer from bounding a long annotation's width.

/** One node of Mermaid's class-diagram data (only the fields read here). */
export interface ClassNode {
  shape?: string;
  label?: unknown;
  wrappingWidth?: number;
  cssStyles?: string[];
  styles?: string[];
  members?: unknown[];
  methods?: unknown[];
  [key: string]: unknown;
}

export interface ClassDiagramData {
  nodes?: ClassNode[];
  config?: { class?: { wrappingWidth?: unknown } };
  [key: string]: unknown;
}

/** A class member whose style Mermaid computes through parseClassifier(). */
interface ClassifierMember {
  parseClassifier?: (...args: unknown[]) => string;
}

export function compactClassNotes(data: ClassDiagramData, defaultWidth = 240): ClassDiagramData {
  if (!Array.isArray(data?.nodes)) return data;
  const authored = Number(data.config?.class?.wrappingWidth);
  const width = authored > 0 ? authored : defaultWidth;
  let changed = false;
  const nodes = data.nodes.map((node): ClassNode => {
    if (node.shape !== "note" || (node.wrappingWidth ?? 0) > 0 || typeof node.label !== "string" || /<br\b|\n/i.test(node.label)) return node;
    changed = true;
    return { ...node, wrappingWidth: width,
      cssStyles: (node.cssStyles || []).map(style => /^\s*white-space\s*:\s*nowrap\s*;?\s*$/i.test(style) ? "white-space: normal" : style) };
  });
  return changed ? { ...data, nodes } : data;
}

// Classifier styles are installed before Mermaid measures each member label.
// Applying the member font after layout clips HTML labels measured in sans.
export function measureClassMembers(data: ClassDiagramData, font: string): ClassDiagramData {
  if (!font || !Array.isArray(data?.nodes)) return data;
  const measure = (members: unknown[] | undefined) => (members || []).map(entry => {
    const member = entry as ClassifierMember | null;
    if (typeof member?.parseClassifier !== "function") return entry;
    const parseClassifier = member.parseClassifier;
    const clone: ClassifierMember = Object.create(Object.getPrototypeOf(member) as object) as ClassifierMember;
    Object.assign(clone, member);
    clone.parseClassifier = function(this: unknown, ...args: unknown[]) {
      const style = Reflect.apply<unknown, unknown[], string>(parseClassifier, this, args);
      return /font-family\s*:/i.test(style) ? style : `${style};font-family: ${font}`;
    };
    return clone;
  });
  return { ...data, nodes: data.nodes.map((node): ClassNode => {
    if (node.shape !== "classBox" || [...(node.styles || []), ...(node.cssStyles || [])].some(style => /font-family\s*:/i.test(style))) return node;
    return { ...node, members: measure(node.members), methods: measure(node.methods) };
  }) };
}

type GetData = (this: unknown, ...args: unknown[]) => ClassDiagramData;

/** The slice of Mermaid's private engine this module adapts. */
export interface ClassNoteEngine {
  mermaidAPI?: { getDiagramFromText(text: string): Promise<{ type?: string; db: object } | undefined | void> };
}

export async function withClassNoteLayout<R>(engine: ClassNoteEngine, source: string, draw: () => Promise<R>, memberFont = ""): Promise<R> {
  if (!/^\s*classDiagram(?:-v2)?\b/m.test(source)) return draw();
  const preserveLayout = /%%\s*ibm:keep-layout/.test(source) || /["']?layout["']?\s*:/.test(source);
  let proto: { getData: GetData };
  let original: GetData;
  try {
    const diagram = await engine.mermaidAPI?.getDiagramFromText(source);
    if (!diagram || diagram.type !== "classDiagram") return draw();
    proto = Object.getPrototypeOf(diagram.db) as { getData: GetData };
    original = proto?.getData;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "getData");
    if (typeof original !== "function" || !descriptor?.writable) return draw();
  } catch { return draw(); }
  // Only the private engine's draw is adapted. Restore even on parse/render
  // errors; authored source and the class database remain unchanged.
  const adapted = function(this: unknown, ...args: unknown[]) {
    const data: ClassDiagramData = Reflect.apply<unknown, unknown[], ClassDiagramData>(original, this, args);
    return measureClassMembers(preserveLayout ? data : compactClassNotes(data), memberFont);
  };
  proto.getData = adapted;
  try { return await draw(); }
  finally { if (proto.getData === adapted) proto.getData = original; }
}
