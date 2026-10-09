import { expect, it } from 'vitest';
import { svgPaintTokens } from './svg-export-paints';
it('keeps distinct dark roles even when their light colors are identical',()=>{
 const card={},canvas={},light=new Map([['card',{node:card,values:{fill:'rgb(255, 255, 255)'}}],['canvas',{node:canvas,values:{fill:'rgb(255, 255, 255)'}}]]),dark=new Map([['card',{values:{fill:'rgb(36, 50, 73)'}}],['canvas',{values:{fill:'rgb(14, 20, 32)'}}]]),first={},second={};
 const tokens=svgPaintTokens(light,dark,first,second);
 expect(tokens.get(card).get('fill')).not.toBe(tokens.get(canvas).get('fill'));
 expect(second[tokens.get(card).get('fill')]).toBe('rgb(36, 50, 73)');
 expect(second[tokens.get(canvas).get('fill')]).toBe('rgb(14, 20, 32)');
});
it('shares equivalent pairs and leaves static author colors and missing matches untouched',()=>{
 const a={},b={},fixed={},missing={},values={fill:'rgba(20, 40, 60, 0.2)'},other={fill:'rgba(80, 100, 120, 0.2)'};
 const light=new Map([['a',{node:a,values}],['b',{node:b,values}],['fixed',{node:fixed,values:{fill:'red'}}],['missing',{node:missing,values}]]),dark=new Map([['a',{values:other}],['b',{values:other}],['fixed',{values:{fill:'red'}}]]),first={},second={};
 const tokens=svgPaintTokens(light,dark,first,second);
 expect(tokens.get(a).get('fill')).toBe(tokens.get(b).get('fill'));
 expect(tokens.has(fixed)).toBe(false);expect(tokens.has(missing)).toBe(false);
 expect(Object.keys(first)).toHaveLength(1);
 expect(second[tokens.get(a).get('fill')]).toBe(other.fill);
});

it('preserves theme-dependent SVG corner radii',()=>{
 const node={},first={},second={};
 const tokens=svgPaintTokens(new Map([['rect',{node,values:{rx:'10px',ry:'10px'}}]]),new Map([['rect',{values:{rx:'14px',ry:'14px'}}]]),first,second);
 const token=tokens.get(node).get('rx');
 expect(tokens.get(node).get('ry')).toBe(token);
 expect(first[token]).toBe('10px');expect(second[token]).toBe('14px');
});

it('retains auto as the light value when dark geometry is explicit',()=>{
 const node={},first={},second={};
 const tokens=svgPaintTokens(new Map([['rect',{node,values:{rx:'auto'}}]]),new Map([['rect',{values:{rx:'14px'}}]]),first,second);
 const token=tokens.get(node).get('rx');
 expect(first[token]).toBe('auto');expect(second[token]).toBe('14px');
});
