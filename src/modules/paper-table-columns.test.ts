import { describe, expect, it, vi } from 'vitest';
import { paperColumnShares, preparePaperTableColumns } from './paper-table-columns.js';
describe('paper table column allocation', () => {
  it('gives a long field more room without exceeding the paper width', () => {
    const shares = paperColumnShares([['ID', 'Field', 'Notes'], ['001', 'A'.repeat(340), 'short']]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(shares[1]).toBeGreaterThan(shares[0] * 3);
    expect(Math.max(...shares) / Math.min(...shares)).toBeLessThanOrEqual(4);
  });
  it('reserves readable short-label width and keeps the total bounded', () => {
    const shares = paperColumnShares([['ID', 'Field', 'Note'], ['001', 'A'.repeat(340), 'short']], [22, 0, 0]);
    expect(shares[0]).toBeGreaterThanOrEqual(22);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    expect(shares.every(value => value > 0)).toBe(true);
  });
  it('keeps balanced content balanced and rejects irregular rows', () => {
    expect(paperColumnShares([['A', 'B'], ['one', 'two']])).toEqual([50, 50]);
    expect(paperColumnShares([['A', 'B'], ['one']])).toEqual([]);
    expect(paperColumnShares([])).toEqual([]);
  });
  it('measures all table widths before changing any column layout', () => {
    const events: string[] = [];
    const document = { createElement: tag => tag === 'canvas'
      ? { getContext: () => ({ measureText: () => ({ width: 20 }) }) }
      : { style: {}, appendChild: () => {} } };
    const table = id => ({ ownerDocument: document,
      rows: [['ID', 'Name'], ['001', 'Alice']].map(row => ({ cells: row.map(textContent => ({ textContent, colSpan: 1, rowSpan: 1 })) })),
      querySelector: () => null,
      getBoundingClientRect: () => { events.push(`read-${id}`); return { width: 400 }; },
      insertBefore: () => events.push(`write-${id}`)
    });
    vi.stubGlobal('getComputedStyle', () => ({ font: '14px sans-serif', paddingLeft: '4', paddingRight: '4' }));
    try {
      preparePaperTableColumns({ ownerDocument: document, querySelectorAll: () => [table(1), table(2)] } as unknown as HTMLElement);
      expect(events).toEqual(['read-1', 'read-2', 'write-1', 'write-2']);
    } finally { vi.unstubAllGlobals(); }
  });
});
