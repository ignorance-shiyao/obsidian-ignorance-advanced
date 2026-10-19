/* Your own callout types. One per line in the settings: `名称 | 颜色 | 图标`, for example
     faq | #7C5CFF | help-circle
   `名称` is what goes in `> [!名称]`; `颜色` is #RGB, #RRGGBB or one of the four theme palettes
   (info, warning, success, error); `图标` is a Lucide icon name and may be left out. */
export interface CustomCallout { name: string; color: string; icon: string }

const PALETTES = new Set(["info", "warning", "success", "error"]);
const NAME = /^[A-Za-z0-9_\u4e00-\u9fff-]{1,32}$/;
const ICON = /^[a-z0-9-]{1,40}$/;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function parseCustomCallouts(text: string): { callouts: CustomCallout[]; ignored: string[] } {
  const callouts: CustomCallout[] = [];
  const ignored: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [name = "", color = "", icon = ""] = line.split("|").map(part => part.trim());
    const key = name.toLowerCase();
    if (!NAME.test(name) || seen.has(key) || !(HEX.test(color) || PALETTES.has(color.toLowerCase())) || (icon && !ICON.test(icon))) { ignored.push(line); continue; }
    seen.add(key);
    callouts.push({ name, color: color.toLowerCase(), icon: icon.replace(/^lucide-/, "") });
  }
  return { callouts, ignored };
}

const cssString = (value: string) => value.replace(/["\\]/g, "");

/** Stylesheet text for the callouts: the colours come from the theme palettes or from a mix with the paper colour. */
export function customCalloutCss(callouts: CustomCallout[]): string {
  return callouts.map(({ name, color, icon }) => {
    const selector = `.callout[data-callout="${cssString(name)}" i]`;
    const lines = [icon ? `--callout-icon: lucide-${icon};` : ""];
    if (PALETTES.has(color)) lines.push(`--ib-callout-semantic-text: var(--ib-${color}-text);`, `background: var(--ib-${color}-bg);`, `border-color: var(--ib-${color}-border);`);
    else lines.push(`--ib-callout-semantic-text: ${color};`, `background: color-mix(in srgb, ${color} 10%, var(--ib-bg-primary));`, `border-color: color-mix(in srgb, ${color} 28%, var(--ib-bg-primary));`);
    const iconColor = PALETTES.has(color) ? `var(--ib-${color}-icon)` : color;
    return `${selector} { ${lines.filter(Boolean).join(" ")} }\n${selector} > .callout-title > .callout-icon { color: ${iconColor}; }`;
  }).join("\n");
}
