import { describe, expect, it, vi } from 'vitest';
import { stagingStyleSheet } from './isolated-staging';
function documentFor(sheets) {
  class Sheet { source = ''; replaceSync(source) { this.source = source; } }
  return { styleSheets: sheets, defaultView: { CSSStyleSheet: Sheet } } as any;
}
describe('isolated measurement stylesheet source', () => {
  it('preserves variable shorthand declarations lost by CSSOM serialization', async () => {
    const original = '.note { border:var(--width) solid red; border-left:3px solid blue; }';
    const doc = documentFor([{ ownerNode: { textContent: original }, cssRules: [{ cssText: '.note { border-top-width: ; border-left:3px solid blue; }' }] }]);
    expect((await stagingStyleSheet(doc) as any).source).toBe(original);
  });
  it('reuses unchanged sources but updates an edited theme and excludes disabled sheets', async () => {
    const theme = { ownerNode: { textContent: '.note { color:red; }' }, cssRules: [] };
    const doc = documentFor([theme, { disabled: true, ownerNode: { textContent: '.note { display:none; }' } }]);
    const first = await stagingStyleSheet(doc);
    expect(await stagingStyleSheet(doc)).toBe(first);
    theme.ownerNode.textContent = '.note { color:blue; }';
    const changed = await stagingStyleSheet(doc);
    expect(changed).not.toBe(first);
    expect((changed as any).source).toBe(theme.ownerNode.textContent);
  });
  it('loads linked source once and retries after a failed read', async () => {
    const doc = documentFor([{ href: 'app://obsidian.md/app.css', ownerNode: { textContent: '' }, cssRules: [] }]);
    const fetch = vi.fn().mockRejectedValueOnce(Error('unavailable')).mockResolvedValue('.note { border:1px solid red; }');
    await expect(stagingStyleSheet(doc, fetch)).rejects.toThrow('unavailable');
    const first = await stagingStyleSheet(doc, fetch);
    expect(await stagingStyleSheet(doc, fetch)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
