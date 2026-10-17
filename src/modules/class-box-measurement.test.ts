import { describe, expect, it } from 'vitest';
import { classBoxBounds, withClassBoxMeasurement } from './class-box-measurement';

// A stand-in for the SVG node the measurement reads: its size, whether it matches a selector, children.
interface FakeNode {
  box?: { width: number };
  ownerSVGElement?: { id: string };
  matches: (selector: string) => boolean;
  querySelector: (selector: string) => boolean;
  children: FakeNode[];
}
interface FakePrototype { getBBox: (this: FakeNode) => { x: number; y: number; width: number; height: number } }

describe('class compartments before edge routing', () => {
  it('fits the widest compartment instead of adding a centered title offset', () => {
    const box={x:-80,y:-100,width:345,height:198};
    expect(classBoxBounds(box,[{width:162,header:true},{width:264,header:false}])).toEqual({...box,width:264});
    expect(box.width).toBe(345);
  });
  it('reserves space for a header icon even in an empty short-name class', () => {
    expect(classBoxBounds({x:-7,y:0,width:14,height:54},[{width:14,header:true},{width:0,header:false}]).width).toBe(50);
    expect(classBoxBounds({x:-7,y:0,width:14,height:54},[{width:14,header:true}],12).width).toBe(42);
  });
  it('leaves foreign SVGs and finished outlines untouched, and restores after rejection', async () => {
    const original=function(this: FakeNode){return {x:0,y:0,height:198,...(this.box ?? {width:300})};};
    const prototype: FakePrototype={getBBox:original},engine={mermaidAPI:{getConfig:()=>({class:{padding:8}})}};
    const make=(id: string,finished=false): FakeNode=>Object.assign(Object.create(prototype) as FakeNode,{
      ownerSVGElement:{id},matches:()=>true,querySelector:(selector: string)=>selector.includes('label-container')?finished:true,
      children:[{box:{width:162},matches:(selector: string)=>selector.includes('.label-group')},{box:{width:264},matches:(selector: string)=>selector.includes('.members-group')}]
    });
    const measure=(node: FakeNode)=>Reflect.apply(prototype.getBBox,node,[]).width;
    await expect(withClassBoxMeasurement(engine,'drawing','classDiagram',async()=>{
      expect(measure(make('drawing'))).toBe(264);
      expect(measure(make('other'))).toBe(300);
      expect(measure(make('drawing',true))).toBe(300);
      throw Error('layout failed');
    },prototype)).rejects.toThrow('layout failed');
    expect(prototype.getBBox).toBe(original);
  });
  it('does not change other diagram families', async () => {
    const prototype: FakePrototype={getBBox:()=>({x:0,y:0,width:300,height:100})},original=prototype.getBBox;
    await withClassBoxMeasurement({},'drawing','flowchart LR\nA-->B',()=>expect(prototype.getBBox).toBe(original),prototype);
  });
});
