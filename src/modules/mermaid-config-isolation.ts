// Preflight parsing also applies Mermaid directives to its shared config.
// Reset before parsing, and on every exit, so authored options affect one
// diagram while the private engine's site defaults stay authoritative.
export async function withMermaidConfigIsolation(engine, draw) {
  const reset = engine.mermaidAPI?.reset;
  if (typeof reset !== 'function') return draw();
  reset.call(engine.mermaidAPI);
  try { return await draw(); }
  finally { reset.call(engine.mermaidAPI); }
}
