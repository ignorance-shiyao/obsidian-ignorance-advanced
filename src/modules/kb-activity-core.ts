import { DAY, dayKey, inFolder, startOfDay } from "./kb-index-core.js";
import type { KbNote } from "./kb-index-core.js";

/* Activity per day, shared by the home sparkline and the heatmap. A note counts once per day:
   file sync touches mtime, so a note created and edited on the same day is one entry, not two. */

export type ActivityMetric = "created" | "modified" | "both";

export interface ActivityDay { day: string; time: number; paths: string[] }

export function activityDays(notes: Iterable<KbNote>, metric: ActivityMetric, from: number, to: number, folder = ""): Map<string, ActivityDay> {
  const days = new Map<string, ActivityDay>();
  const start = startOfDay(from);
  for (let t = start; t <= to; t = startOfDay(t + DAY * 1.5)) days.set(dayKey(t), { day: dayKey(t), time: t, paths: [] });
  for (const note of notes) {
    if (folder && !inFolder(note.path, folder)) continue;
    const keys = new Set<string>();
    if (metric !== "modified") keys.add(dayKey(note.ctime));
    if (metric !== "created") keys.add(dayKey(note.mtime));
    for (const key of keys) days.get(key)?.paths.push(note.path);
  }
  return days;
}

/** "365", "12w", "6m", "1y" → days; anything else → fallback. */
export function parseRange(value: string | undefined, fallback = 365): number {
  const m = /^\s*(\d+)\s*([dwmy]?)\s*$/i.exec(value ?? "");
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const days = unit === "w" ? n * 7 : unit === "m" ? n * 30 : unit === "y" ? n * 365 : n;
  return Math.min(3660, Math.max(1, days));
}
