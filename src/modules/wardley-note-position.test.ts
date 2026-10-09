import { expect, it } from 'vitest';
import { segmentCrossesBox, wardleyNotePosition } from './wardley-note-position';
it('checks horizontal, vertical, diagonal and degenerate segments',()=>{
 const box={x:40,y:40,width:20,height:20};
 expect(segmentCrossesBox({x1:0,y1:50,x2:100,y2:50},box)).toBe(true);
 expect(segmentCrossesBox({x1:50,y1:0,x2:50,y2:100},box)).toBe(true);
 expect(segmentCrossesBox({x1:0,y1:0,x2:100,y2:100},box)).toBe(true);
 expect(segmentCrossesBox({x1:0,y1:0,x2:100,y2:100},{x:80,y:10,width:5,height:5})).toBe(false);
 expect(segmentCrossesBox({x1:50,y1:50,x2:50,y2:50},box)).toBe(true);
 expect(segmentCrossesBox({x1:10,y1:10,x2:10,y2:10},box)).toBe(false);
});
it('finds space without covering nodes, links or leaving chart bounds',()=>{
 const label={x:40,y:40,width:20,height:20},node={x:0,y:0,width:25,height:25},segment={x1:0,y1:50,x2:100,y2:50};
 const target=wardleyNotePosition(label,[node],[segment],{x:0,y:0,width:100,height:100});
 expect(target).not.toBeNull();
 expect(segmentCrossesBox(segment,target,8)).toBe(false);
 expect(target.x).toBeGreaterThanOrEqual(0);
 expect(target.y+target.height).toBeLessThanOrEqual(100);
});
it('retains good positions and reports when no complete position fits',()=>{
 const label={x:10,y:10,width:20,height:20},bounds={x:0,y:0,width:100,height:100};
 expect(wardleyNotePosition(label,[],[],bounds)).toBe(label);
 expect(wardleyNotePosition(label,[bounds],[],bounds)).toBeNull();
 expect(wardleyNotePosition({...label,width:200},[],[],bounds)).toBeNull();
});
