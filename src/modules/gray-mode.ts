/* Gray mode: on the dates listed in settings (one MM-DD per line) the whole app turns grayscale, for days of
   remembrance. Nothing is on by default. */
export function parseGrayDates(text: string): Set<string> {
  const dates = new Set<string>();
  for (const line of String(text || "").split(/[\n,，;；\s]+/)) {
    const match = /^(\d{1,2})[-/.月](\d{1,2})日?$/.exec(line.trim());
    if (!match) continue;
    const month = Number(match[1]), day = Number(match[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) dates.add(`${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

export function isGrayDay(dates: Set<string>, now = new Date()) {
  return dates.has(`${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
}

export function installGrayMode(plugin) {
  const apply = () => document.body.classList.toggle("ib-gray-mode", isGrayDay(parseGrayDates(plugin.state?.grayDates)));
  plugin.applyGrayMode = apply;
  apply();
  plugin.registerInterval(window.setInterval(apply, 30 * 60 * 1000));
  plugin.register(() => document.body.classList.remove("ib-gray-mode"));
}
