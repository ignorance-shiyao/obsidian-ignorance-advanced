const DAY = 86400000;
const intervals: [number, string][] = [
  [1, "1millisecond"], [10, "10millisecond"], [100, "100millisecond"],
  [1000, "1second"], [5000, "5second"], [15000, "15second"],
  [60000, "1minute"], [300000, "5minute"], [900000, "15minute"],
  [3600000, "1hour"], [10800000, "3hour"], [21600000, "6hour"],
  [DAY, "1day"], [2 * DAY, "2day"], [4 * DAY, "4day"],
  [7 * DAY, "1week"], [14 * DAY, "2week"],
  [30 * DAY, "1month"], [90 * DAY, "3month"], [180 * DAY, "6month"],
  [365 * DAY, "12month"]
];

// Use parsed task dates, including dependencies and exclusions, rather than
// guessing the author's date format from source text.
export function ganttTickInterval(tasks, plotWidth: number, authoredInterval?) {
  if (authoredInterval) return null;
  const dates = tasks.flatMap(task => [+task.startTime, +task.endTime]).filter(Number.isFinite);
  if (!dates.length) return null;
  const span = Math.max(...dates) - Math.min(...dates);
  if (span <= 0) return null;
  const count = Math.max(2, Math.min(12, Math.floor(plotWidth / 64)));
  const minimum = span / count;
  return intervals.find(([duration]) => duration >= minimum)?.[1]
    ?? `${Math.ceil(minimum / (30 * DAY))}month`;
}
