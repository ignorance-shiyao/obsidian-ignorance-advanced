
// Preflight parsing also applies Mermaid directives to its shared config.
// Reset before parsing, and on every exit, so authored options affect one
// diagram while the private engine's site defaults stay authoritative.
export async function withMermaidConfigIsolation<T>(engine: object, draw: () => T | Promise<T>): Promise<T> {
  const api: unknown = "mermaidAPI" in engine ? engine.mermaidAPI : undefined;
  const reset = typeof api === 'object' && api !== null && "reset" in api ? api.reset : undefined;
  if (typeof reset !== 'function') return draw();
  Reflect.apply(reset, api, []);
  try { return await draw(); }
  finally { Reflect.apply(reset, api, []); }
}
