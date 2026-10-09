import { describe, expect, it } from 'vitest';
import { compactClassNotes, measureClassMembers, withClassNoteLayout } from './class-note-layout';

describe('class annotation layout', () => {
  it('bounds a note without changing its text, class members or relations', () => {
    const note={shape:'note',label:'An order becomes immutable after fulfillment starts.',cssStyles:['text-align: left','white-space: nowrap','fill: yellow']};
    const member={shape:'classBox',id:'Order',members:['+UUID id']};
    const data={nodes:[member,note],edges:[{start:'note0',end:'Order',pattern:'dotted'}],direction:'LR'};
    const result=compactClassNotes(data);
    expect(result.nodes[0]).toBe(member);
    expect(result.nodes[1].label).toBe(note.label);
    expect(result.nodes[1].wrappingWidth).toBe(240);
    expect(result.nodes[1].cssStyles).toEqual(['text-align: left','white-space: normal','fill: yellow']);
    expect(result.edges).toBe(data.edges);
    expect(result.direction).toBe('LR');
    expect(note.cssStyles[1]).toBe('white-space: nowrap');
  });
  it('respects authored widths and deliberate line breaks', () => {
    const notes=[{shape:'note',label:'custom',wrappingWidth:380},{shape:'note',label:'first<br/>second'},{shape:'note',label:'first\nsecond'}];
    const data={nodes:notes};expect(compactClassNotes(data)).toBe(data);
    expect(compactClassNotes({nodes:[{shape:'note',label:'content'}],config:{class:{wrappingWidth:180}}}).nodes[0].wrappingWidth).toBe(180);
  });
  it('restores the private database method after a failed draw', async () => {
    class Database { getData(){return {nodes:[{shape:'note',label:'content'}]};} }
    const original=Database.prototype.getData,engine={mermaidAPI:{getDiagramFromText:async()=>({type:'classDiagram',db:new Database()})}};
    await expect(withClassNoteLayout(engine,'classDiagram',async()=>{
      expect(new Database().getData().nodes[0].wrappingWidth).toBe(240);
      throw Error('drawing failed');
    })).rejects.toThrow('drawing failed');
    expect(Database.prototype.getData).toBe(original);
  });
  it('leaves other diagram families untouched', async () => {
    let parses=0;const engine={mermaidAPI:{getDiagramFromText:async()=>{parses++;}}};
    expect(await withClassNoteLayout(engine,'flowchart LR\nA-->B',()=>Promise.resolve('original'))).toBe('original');
    expect(parses).toBe(0);
  });
  it('measures complete members while preserving explicit layouts and notes', async () => {
    const member={text:'+requestRefund()',parseClassifier:()=>''};
    const note={shape:'note',label:'Author annotation',cssStyles:['white-space: nowrap']};
    class Database { getData(){return {nodes:[{shape:'classBox',members:[member]},note],direction:'LR'};} }
    const original=Database.prototype.getData,engine={mermaidAPI:{getDiagramFromText:async()=>({type:'classDiagram',db:new Database()})}};
    for(const source of ['%%{init: {"layout":"elk"}}%%\nclassDiagram','classDiagram\n%% ibm:keep-layout']) {
      await withClassNoteLayout(engine,source,async()=>{
        const data=new Database().getData();
        expect(data.nodes[1]).toBe(note);
        expect(data.direction).toBe('LR');
        expect(data.nodes[0].members[0].parseClassifier()).toContain('font-family: Menlo');
      },'Menlo');
      expect(Database.prototype.getData).toBe(original);
    }
  });
});

describe('class member measurement font', () => {
  it('preserves classifier semantics and source objects while measuring the display font', () => {
    class Member { text='+register()'; parseClassifier(){return 'font-style: italic';} }
    const member=new Member(), data={nodes:[{shape:'classBox',members:[member],methods:[]}],direction:'LR',edges:[]};
    const result=measureClassMembers(data,'Menlo, monospace');
    expect(result.nodes[0].members[0]).toBeInstanceOf(Member);
    expect(result.nodes[0].members[0].parseClassifier()).toBe('font-style: italic;font-family: Menlo, monospace');
    expect(member.parseClassifier()).toBe('font-style: italic');
    expect(result.nodes[0].members[0].text).toBe(member.text);
    expect(result.edges).toBe(data.edges);
    expect(result.direction).toBe('LR');
  });
  it('retains authored member and node font styles', () => {
    const member={parseClassifier:()=> 'font-family: serif'};
    const node={shape:'classBox',styles:['font-family: Georgia'],members:[member]};
    expect(measureClassMembers({nodes:[node]},'monospace').nodes[0]).toBe(node);
    expect(measureClassMembers({nodes:[{shape:'classBox',members:[member]}]},'monospace').nodes[0].members[0].parseClassifier()).toBe('font-family: serif');
  });
});
