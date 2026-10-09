import { describe, expect, it } from 'vitest';
import { readerPreferenceId } from './reader-preferences';
describe('阅读器手动偏好的导出范围', () => {
  it('同一文档与外观稳定，不依赖属性顺序', () => {
    expect(readerPreferenceId('a.md', 'light', { font: 'sans', accent: 'blue' }))
      .toBe(readerPreferenceId('a.md', 'light', { accent: 'blue', font: 'sans' }));
  });
  it('其他文档、明暗、配色与字体不会沿用旧选择', () => {
    const original=readerPreferenceId('a.md', 'light', { font: 'sans', accent: 'blue' });
    for(const next of [readerPreferenceId('b.md','light',{font:'sans',accent:'blue'}),readerPreferenceId('a.md','dark',{font:'sans',accent:'blue'}),readerPreferenceId('a.md','light',{font:'serif',accent:'blue'}),readerPreferenceId('a.md','light',{font:'sans',accent:'green'})])expect(next).not.toBe(original);
  });
});
