import { expect, it } from 'vitest';
import { withClassElkSpacing } from './class-elk-spacing';

it('scopes class spacing while preserving the existing ELK adapter and graph', async () => {
  const original = graph => ({...graph, layoutOptions:{...graph.layoutOptions,algorithm:'layered'}}),owner={__ibmElkTune:original};
  const graph={children:[{id:'A'}],layoutOptions:{direction:'RIGHT'}};
  await withClassElkSpacing('classDiagram\ndirection LR',()=>{
    const adapted=owner.__ibmElkTune(graph);
    expect(adapted.layoutOptions).toMatchObject({direction:'RIGHT',algorithm:'layered','elk.spacing.nodeNode':'28'});
    expect(adapted.children).toBe(graph.children);
    expect(graph.layoutOptions).toEqual({direction:'RIGHT'});
  },owner);
  expect(owner.__ibmElkTune).toBe(original);
});
it('leaves authored layout and spacing, keep-layout, and other families intact', async () => {
  const original=graph=>graph,owner={__ibmElkTune:original};
  for(const source of ['flowchart LR\nA-->B','%% ibm:keep-layout\nclassDiagram','%%{init: {"layout":"elk"}}%%\nclassDiagram','%%{init: {"nodeSpacing":80}}%%\nclassDiagram','---\nconfig:\n  elk:\n    spacing.nodeNode: 60\n---\nclassDiagram'])
    await withClassElkSpacing(source,()=>expect(owner.__ibmElkTune).toBe(original),owner);
});
it('restores the adapter after a rejected render', async () => {
  const original=graph=>graph,owner={__ibmElkTune:original};
  await expect(withClassElkSpacing('classDiagram',()=>{throw Error('render failed');},owner)).rejects.toThrow('render failed');
  expect(owner.__ibmElkTune).toBe(original);
});
