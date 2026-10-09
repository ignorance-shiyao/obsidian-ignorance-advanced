import { describe, expect, it } from 'vitest';
import { graphPixelBounds, fitDefaultGraph } from './echarts-graph';
const chart = (option = {}) => {
 const model = {option:{zoom:1,...option},subType:'graph',getData:()=>({count:()=>2,getItemLayout:(i:number)=>i?[20,20]:[0,0],getItemVisual:()=>10}),get:(key:string)=>model.option[key]};
 const events:any[]=[];
 return {getModel:()=>({getSeriesByIndex:()=>model}),convertToPixel:(_finder:any,p:number[])=>p,getWidth:()=>100,getHeight:()=>100,dispatchAction:(event:any)=>events.push(event),events};
};
describe('graph 节点范围及默认视图',()=>{
 it('按真实像素转换和节点直径计算包围盒面积',()=>{
  const c=chart();expect(graphPixelBounds(c,0)).toMatchObject({left:-5,right:25,top:-5,bottom:25,width:30,height:30,ratio:.09});
 });
 it('默认 zoom 不超过 3 且预留画布边距，并把中心移入图框中点',()=>{
  const c=chart();fitDefaultGraph(c,{type:'graph'},0);expect(c.events[0]).toMatchObject({type:'graphRoam',zoom:1.2,dx:40,dy:40});
 });
 it('保留作者的 zoom 与 center，且不处理非 graph',()=>{
  const c=chart({zoom:2});fitDefaultGraph(c,{type:'graph',zoom:2,center:[10,20],roam:false,force:{repulsion:10},label:{textBorderWidth:3}},0);fitDefaultGraph(c,{type:'bar'},0);expect(c.events).toHaveLength(0);
  fitDefaultGraph(c,{type:'graph',zoom:2},0);expect(c.events[0].zoom).toBe(1);
  });
 it('单独显式 center 保留精确数组；缩放以画布中心为锚点',()=>{
  const c=chart({center:[30,20]});fitDefaultGraph(c,{type:'graph',center:[30,20]},0);
  expect(c.events[0]).toMatchObject({originX:50,originY:50,dx:0,dy:0});
  expect(c.getModel().getSeriesByIndex().option.center).toEqual([30,20]);
 });
});
