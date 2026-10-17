/* Code that only exports and slides need (Word, PPTX, Reveal.js, page
   capture) is bundled behind dynamic imports, which esbuild turns into lazily
   initialised modules: it is evaluated the first time a feature uses it, not
   on every start. */
const CHUNKS = {
  "chunk-docx.cjs": () => import("../chunks/docx"),
  "chunk-pptx.cjs": () => import("../chunks/pptx"),
  "chunk-reveal.cjs": () => import("../chunks/reveal"),
  "chunk-capture.cjs": () => import("../chunks/capture")
};

type Chunks = typeof CHUNKS;
const loaded = new Map<keyof Chunks, Promise<unknown>>();

export function loadChunk<Name extends keyof Chunks>(name: Name): ReturnType<Chunks[Name]> {
  if (!loaded.has(name)) {
    const job = CHUNKS[name]();
    job.catch(() => loaded.delete(name));
    loaded.set(name, job);
  }
  return loaded.get(name) as ReturnType<Chunks[Name]>;
}
