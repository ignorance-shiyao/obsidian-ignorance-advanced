import { describe, expect, it } from 'vitest';
import { classBoxBounds, withClassBoxMeasurement } from './class-box-measurement';

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
    const original=function(){return this.box || {x:0,y:0,width:300,height:198};};
    const prototype={getBBox:original},engine={mermaidAPI:{getConfig:()=>({class:{padding:8}})}};
    const make=(id,finished=false)=>Object.assign(Object.create(prototype),{
      ownerSVGElement:{id},matches:()=>true,querySelector:selector=>selector.includes('label-container')?finished:true,
      children:[{box:{width:162},matches:selector=>selector.includes('.label-group')},{box:{width:264},matches:selector=>selector.includes('.members-group')}]
    });
    await expect(withClassBoxMeasurement(engine,'drawing','classDiagram',async()=>{
      expect(prototype.getBBox.call(make('drawing')).width).toBe(264);
      expect(prototype.getBBox.call(make('other')).width).toBe(300);
      expect(prototype.getBBox.call(make('drawing',true)).width).toBe(300);
      throw Error('layout failed');
    },prototype)).rejects.toThrow('layout failed');
    expect(prototype.getBBox).toBe(original);
  });
  it('does not change other diagram families', async () => {
    const prototype={getBBox:()=>({width:300})},original=prototype.getBBox;
    await withClassBoxMeasurement({},'drawing','flowchart LR\nA-->B',()=>expect(prototype.getBBox).toBe(original),prototype);
  });
});
