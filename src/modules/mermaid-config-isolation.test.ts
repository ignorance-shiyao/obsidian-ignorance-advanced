import { describe, expect, it } from 'vitest';
import { withMermaidConfigIsolation } from './mermaid-config-isolation';

describe('per-diagram Mermaid configuration', () => {
  it('clears previous directives before parsing and after an authored draw', async () => {
    const api = { config:{ padding:8 }, reset(){ this.config = { padding:12 }; } };
    const engine = { mermaidAPI:api };
    const authored = await withMermaidConfigIsolation(engine, async () => {
      expect(api.config.padding).toBe(12);
      api.config.padding = 6;
      await Promise.resolve();
      return api.config.padding;
    });
    expect(authored).toBe(6);
    expect(await withMermaidConfigIsolation(engine, () => api.config.padding)).toBe(12);
  });
  it('restores defaults when parsing or rendering rejects', async () => {
    const api = { changed:false, reset(){ this.changed = false; } };
    await expect(withMermaidConfigIsolation({mermaidAPI:api}, async () => {
      api.changed = true; throw Error('invalid diagram');
    })).rejects.toThrow('invalid diagram');
    expect(api.changed).toBe(false);
  });
  it('supports engines without a configuration reset API', async () => {
    expect(await withMermaidConfigIsolation({}, () => 'svg')).toBe('svg');
  });
});
