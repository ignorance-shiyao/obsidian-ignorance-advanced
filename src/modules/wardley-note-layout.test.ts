import { expect, it } from 'vitest';
import { wardleyNoteLines } from './wardley-note-layout';
it('wraps notes without removing text or spaces',()=>{
 const text='Reliable inventory data unlocks accurate delivery promises';
 const lines=wardleyNoteLines(text,26,(_,count)=>count);
 expect(lines.length).toBeGreaterThan(1);
 expect(lines.join('')).toBe(text);
 expect(lines.every(line=>line.length<=26)).toBe(true);
});
it('preserves an indivisible long token instead of truncating it',()=>{
 expect(wardleyNoteLines('longToken',3,(_,count)=>count)).toEqual(['longToken']);
 expect(wardleyNoteLines('',3,(_,count)=>count)).toEqual([]);
});
