// Scope manual reader choices to the document and its exported appearance.
// New exports must not inherit another reader's global theme or font choice.
export function readerPreferenceId(path: string, mode: string, values: Record<string, string>) {
  const input = JSON.stringify([path, mode, Object.keys(values).sort().map(key => [key, values[key]])]);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 16777619);
  return `v2-${(hash >>> 0).toString(16)}`;
}
