/** Allocate a bounded share of paper width; long fields must not force overflow. */
export function paperColumnShares(rows: string[][], minimumShares: number[] = []): number[] {
  const count = rows[0]?.length || 0;
  if (!count || rows.some(row => row.length !== count)) return [];
  const lengths = Array.from({ length: count }, (_, index) => Math.max(...rows.map(row => {
    // CJK characters occupy roughly twice the Latin advance in body fonts.
    return Array.from(row[index]).reduce((sum, char) => sum + (/[^\x00-\x7f]/.test(char) ? 2 : 1), 0);
  })));
  const weights = lengths.map(length => Math.min(4, Math.max(1, Math.sqrt(length / 24))));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const shares = weights.map(weight => weight / total * 100);
  const floors = weights.map((_, index) => Math.max(0, minimumShares[index] || 0));
  if (floors.reduce((a, b) => a + b, 0) >= 100) return shares;
  const fixed = new Set<number>();
  for (let pass = 0; pass < count; pass++) {
    const reserved = [...fixed].reduce((sum, index) => sum + floors[index], 0);
    const remainingWeight = weights.reduce((sum, weight, index) => sum + (fixed.has(index) ? 0 : weight), 0);
    weights.forEach((weight, index) => { shares[index] = fixed.has(index) ? floors[index] : weight / remainingWeight * (100 - reserved); });
    const deficient = shares.map((share, index) => share < floors[index] - 0.0001 ? index : -1).filter(index => index >= 0);
    if (!deficient.length) break;
    deficient.forEach(index => fixed.add(index));
  }
  return shares;
}

export function preparePaperTableColumns(root: HTMLElement) {
  const context = root.ownerDocument.createElement('canvas').getContext('2d');
  // Read every table before inserting columns: inserting one colgroup changes
  // layout, so measuring the next table would otherwise force another pass.
  const plans = [...root.querySelectorAll<HTMLTableElement>('table')].flatMap(table => {
    // Preserve authored columns and merged-cell layouts.
    if (table.querySelector(':scope > colgroup')) return [];
    const rows = Array.from(table.rows);
    if (rows.some(row => Array.from(row.cells).some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1))) return [];
    const content = rows.map(row => Array.from(row.cells, cell => (cell.textContent || '').trim()));
    const width = table.getBoundingClientRect().width;
    const minimums = content[0]?.map((_, index) => {
      if (!width || !context || content.some(row => !row[index] || row[index].length > 12 || /\s/.test(row[index]))) return 0;
      return Math.max(...rows.map(row => {
        const cell = row.cells[index], style = getComputedStyle(cell);
        context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 4;
        return (context.measureText((cell.textContent || '').trim()).width + padding) / width * 100;
      }));
    }) || [];
    const shares = paperColumnShares(content, minimums);
    return shares.length ? [{ table, shares }] : [];
  });
  for (const { table, shares } of plans) {
    const group = table.ownerDocument.createElement('colgroup');
    shares.forEach(share => {
      const column = table.ownerDocument.createElement('col');
      column.style.width = `${share}%`;
      group.appendChild(column);
    });
    table.insertBefore(group, table.querySelector(':scope > thead, :scope > tbody, :scope > tr'));
  }
}
