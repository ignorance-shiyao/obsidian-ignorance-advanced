import { describe, expect, it } from 'vitest';
import { serializeRules, stagingStyleSheet } from './isolated-staging';
function documentFor(sheets) {
  class Sheet { source = ''; replaceSync(source) { this.source = source; } }
  return { styleSheets: sheets, defaultView: { CSSStyleSheet: Sheet } } as any;
}
// A CSSOM style declaration as Chromium reports `font: var(--f); font-weight: 600`.
function styleOf(longhands: Record<string, string>, shorthands: Record<string, string> = {}) {
  const names = Object.keys(longhands);
  const style: any = { length: names.length, getPropertyValue: (name: string) => longhands[name] ?? shorthands[name] ?? '', getPropertyPriority: () => '' };
  names.forEach((name, index) => { style[index] = name; });
  return style;
}
describe('isolated measurement stylesheet source', () => {
  it('preserves variable shorthand declarations lost by CSSOM serialization', () => {
    const original = '.note { border:var(--width) solid red; border-left:3px solid blue; }';
    const doc = documentFor([{ ownerNode: { textContent: original }, cssRules: [{ cssText: '.note { border-top-width: ; border-left:3px solid blue; }' }] }]);
    expect((stagingStyleSheet(doc) as any).source).toBe(original);
  });
  it('reuses unchanged sources but updates an edited theme and excludes disabled sheets', () => {
    const theme = { ownerNode: { textContent: '.note { color:red; }' }, cssRules: [] };
    const doc = documentFor([theme, { disabled: true, ownerNode: { textContent: '.note { display:none; }' } }]);
    const first = stagingStyleSheet(doc);
    expect(stagingStyleSheet(doc)).toBe(first);
    theme.ownerNode.textContent = '.note { color:blue; }';
    const changed = stagingStyleSheet(doc);
    expect(changed).not.toBe(first);
    expect((changed as any).source).toBe(theme.ownerNode.textContent);
  });
  it('restores var() shorthands of a linked sheet ahead of the longhands that survived', () => {
    const rule = { selectorText: '.note', cssText: '.note { font-family: ; font-weight: 600; }', style: styleOf({ 'font-family': '', 'font-weight': '600', '--gap': '4px' }, { font: 'var(--font-ui)' }) };
    const media = { cssText: '@media (max-width: 400px) { .note { font-family: ; } }', cssRules: [rule] };
    expect(serializeRules([rule as any])).toBe('.note { font: var(--font-ui); font-weight: 600; --gap: 4px; }');
    expect(serializeRules([media as any])).toBe('@media (max-width: 400px) { .note { font: var(--font-ui); font-weight: 600; --gap: 4px; } }');
    const doc = documentFor([{ href: 'app://obsidian.md/app.css', ownerNode: { textContent: '' }, cssRules: [rule] }]);
    expect((stagingStyleSheet(doc) as any).source).toBe('.note { font: var(--font-ui); font-weight: 600; --gap: 4px; }');
  });
});
