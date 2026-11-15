/* Paragraph roaming: in Reading view, J / K walk the note block by block (heading, paragraph, list item, code,
   table), with the current block softly highlighted and kept near the middle of the screen. Pure step logic here. */
export type StepKeys = Pick<KeyboardEvent, "shiftKey" | "metaKey" | "ctrlKey" | "altKey">;

/** How many blocks one key press moves: 1, ⌘/Ctrl 5, Shift 10; Alt belongs to the system, so it moves none. */
export function roamStep(event: StepKeys): number {
  if (event.altKey) return 0;
  if (event.shiftKey) return 10;
  if (event.metaKey || event.ctrlKey) return 5;
  return 1;
}

/** The new position after moving, kept inside the list. */
export function moveRoam(at: number, count: number, direction: 1 | -1, step: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, at + direction * step));
}

/** The first block whose bottom is below `line`, i.e. the one at or just after the middle of the screen. */
export function nearestBlock(bottoms: number[], line: number): number {
  const at = bottoms.findIndex(bottom => bottom > line);
  return at < 0 ? Math.max(0, bottoms.length - 1) : at;
}
