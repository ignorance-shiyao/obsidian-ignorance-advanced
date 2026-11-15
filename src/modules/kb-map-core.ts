import { inFolder, topicOf } from "./kb-index-core.js";
import type { KbFolders, KbNote } from "./kb-index-core.js";

/* Knowledge map: topics of the knowledge folder (large), their notes (small) and the work / personal
   project folders they link to (squares). Edges are links between notes of different topics, and
   from notes to projects; each note is also tied to its topic so the layout keeps topics together. */

export type MapArea = "knowledge" | "work" | "personal";
export type MapKind = "topic" | "note" | "project";

export interface MapNode { id: string; name: string; kind: MapKind; area: MapArea; topic: string; path: string | null; size: number }
export interface MapEdge { source: string; target: string; kind: "member" | "link" }
export interface MapGraph { nodes: MapNode[]; edges: MapEdge[] }

const leaf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export function buildMapGraph(notes: readonly KbNote[], folders: KbFolders): MapGraph {
  const nodes = new Map<string, MapNode>();
  const edges = new Map<string, MapEdge>();
  const addEdge = (source: string, target: string, kind: MapEdge["kind"]) => {
    if (source === target) return;
    const key = kind === "member" ? `${source}>${target}` : [source, target].sort().join("|");
    if (!edges.has(key)) edges.set(key, { source, target, kind });
  };
  const knowledge = notes.filter(note => note.area === "knowledge");
  const byPath = new Map(notes.map(note => [note.path, note]));
  const topicCount = new Map<string, number>();
  for (const note of knowledge) if (note.topic) topicCount.set(note.topic, (topicCount.get(note.topic) ?? 0) + 1);
  for (const [topic, count] of topicCount) nodes.set(topic, { id: topic, name: leaf(topic), kind: "topic", area: "knowledge", topic, path: null, size: count });
  for (const note of knowledge) {
    nodes.set(note.path, { id: note.path, name: note.title, kind: "note", area: "knowledge", topic: note.topic, path: note.path, size: 1 });
    if (note.topic) addEdge(note.topic, note.path, "member");
  }
  const projectOf = (note: KbNote | undefined): string => {
    if (!note || (note.area !== "work" && note.area !== "personal")) return "";
    return topicOf(note.path, folders[note.area]);
  };
  const linkProject = (from: KbNote, project: string, area: MapArea) => {
    const node = nodes.get(project) ?? { id: project, name: leaf(project), kind: "project", area, topic: project, path: null, size: 0 };
    node.size++;
    nodes.set(project, node);
    addEdge(from.path, project, "link");
  };
  for (const note of knowledge) {
    for (const target of note.links) {
      const other = byPath.get(target);
      if (!other) continue;
      if (other.area === "knowledge") { if (other.topic !== note.topic || !note.topic) addEdge(note.path, other.path, "link"); continue; }
      const project = projectOf(other);
      if (project) linkProject(note, project, other.area as MapArea);
    }
  }
  // Projects linking into the knowledge folder count too.
  for (const note of notes) {
    const project = projectOf(note);
    if (!project) continue;
    for (const target of note.links) {
      const other = byPath.get(target);
      if (other?.area === "knowledge" && inFolder(other.path, folders.knowledge)) linkProject(other, project, note.area as MapArea);
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** Nodes kept by an area filter, and only the edges between kept nodes. */
export function filterGraph(graph: MapGraph, areas: ReadonlySet<MapArea>): MapGraph {
  const nodes = graph.nodes.filter(node => areas.has(node.area));
  const ids = new Set(nodes.map(node => node.id));
  return { nodes, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

/** Ids whose name contains the query (case-insensitive); empty query → none. */
export function searchNodes(graph: MapGraph, query: string): string[] {
  const q = query.trim().toLowerCase();
  return q ? graph.nodes.filter(node => node.name.toLowerCase().includes(q)).map(node => node.id) : [];
}

/** The topic page's distilled paragraph: the "## 提炼" section, else the first paragraph after the title. */
export function topicDigest(text: string, max = 400): string {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
  const lines = body.split("\n");
  const start = lines.findIndex(line => /^#{2,3}\s+(提炼|摘要|概述|summary)\s*$/i.test(line));
  let chunk: string[] = [];
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) { if (/^#{1,3}\s/.test(line)) break; chunk.push(line); }
  } else {
    const paragraphs = body.split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !/^#{1,6}\s/.test(p) && !/^(```|\||!\[|<)/.test(p));
    chunk = paragraphs.slice(0, 1);
  }
  const text2 = chunk.join(" ").replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2").replace(/[*_`>#=]+/g, "").replace(/\s+/g, " ").trim();
  return [...text2].length > max ? [...text2].slice(0, max).join("") + "…" : text2;
}
