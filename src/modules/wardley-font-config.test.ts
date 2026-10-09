import { describe, expect, it } from 'vitest';
import { wardleyFontOptions, withWardleyFontConfig } from './wardley-font-config';

describe('Wardley authored font configuration', () => {
  it('accepts supported positive numeric options without copying other keys', () => {
    const source='%%{init: {"wardley-beta":{"labelFontSize":12,"axisFontSize":14,"width":500,"themeCSS":"custom"}}}%%\nwardley-beta';
    expect(wardleyFontOptions(source,JSON.parse)).toEqual({labelFontSize:12,axisFontSize:14});
    expect(wardleyFontOptions('%%{init: {"wardley-beta":{"labelFontSize":-1,"axisFontSize":"14"}}}%%',JSON.parse)).toEqual({});
  });
  it('restores configuration and renderer after a failed draw', async () => {
    let config={'wardley-beta':{labelFontSize:16,axisFontSize:14}};
    const renderer={draw:async()=>{expect(config['wardley-beta'].labelFontSize).toBe(12);throw Error('draw failure');}};
    const original=renderer.draw;
    const engine={mermaidAPI:{getDiagramFromText:async()=>({renderer}),getConfig:()=>structuredClone(config),setConfig:value=>{config={...config,'wardley-beta':{...config['wardley-beta'],...value['wardley-beta']}};}}};
    await expect(withWardleyFontConfig(engine,'%%{init: {"wardley-beta":{"labelFontSize":12}}}%%\nwardley-beta',()=>renderer.draw(),JSON.parse)).rejects.toThrow('draw failure');
    expect(renderer.draw).toBe(original);
    expect(config['wardley-beta']).toEqual({labelFontSize:16,axisFontSize:14});
  });
  it('does not parse unrelated diagrams or change default renders', async () => {
    const engine={mermaidAPI:{getDiagramFromText:()=>{throw Error('unexpected parse');}}};
    expect(await withWardleyFontConfig(engine,'flowchart LR\nA-->B',async()=>42,JSON.parse)).toBe(42);
    expect(await withWardleyFontConfig(engine,'wardley-beta',async()=>42,JSON.parse)).toBe(42);
  });
});
