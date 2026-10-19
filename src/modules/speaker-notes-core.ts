/* Speaker notes live in an Obsidian comment, so they never show in reading view, the audience's slides, or any
   export: %%notes: what to say%% (also 备注 / 讲稿, ASCII or full-width colon, one line or many). Pure. */
const NOTE_COMMENT = /%%\s*(?:notes?|备注|讲稿)\s*[:：]([\s\S]*?)%%/gi;
const FENCE = /^\s*(?:`{3,}|~{3,})/;

/** The notes of one slide's Markdown, joined by blank lines; comments inside code fences do not count. */
export function extractSpeakerNotes(slideSource: string): string {
  const notes: string[] = [];
  let outside: string[] = [], fence = false;
  const flush = () => {
    const text = outside.join("\n");
    outside = [];
    for (const match of text.matchAll(NOTE_COMMENT)) {
      const note = match[1].split("\n").map(line => line.trim()).join("\n").trim();
      if (note) notes.push(note);
    }
  };
  for (const line of slideSource.split("\n")) {
    if (FENCE.test(line)) { if (!fence) flush(); fence = !fence; continue; }
    if (!fence) outside.push(line);
  }
  flush();
  return notes.join("\n\n");
}

/** `mm:ss`, or `h:mm:ss` from an hour on. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}
