// Shared pieces for the icon files built from Material Icon Theme (MIT): language-icons.json for
// code languages and file-icons.json for file types. Both are read lazily, never at startup.
import { readAsset } from "./assets.js";

export interface IconPack {
  icons: Record<string, string>;
  vb: Record<string, string>;
  light: Record<string, string>;
  [table: string]: any;
}

const packs = new Map<string, Promise<IconPack>>();
export function loadPack(plugin, file: string): Promise<IconPack> {
  if (!packs.has(file)) {
    const job = readAsset(plugin, file).then(text => JSON.parse(text) as IconPack);
    job.catch(() => packs.delete(file));
    packs.set(file, job);
  }
  return packs.get(file)!;
}

const svg = (viewBox: string, body: string, cls = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ""} viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

// Markup for one icon. Icons with a light-background variant carry both, and the stylesheet shows
// the one that suits the current theme (see .ib-li-dark / .ib-li-light).
export function iconMarkup(pack: IconPack, name: string | undefined | null): string | null {
  const body = name && pack.icons[name];
  if (!body) return null;
  const view = (n: string) => pack.vb[n] || "0 0 24 24";
  const lightName = pack.light[name!];
  const lightBody = lightName && pack.icons[lightName];
  if (!lightBody) return svg(view(name!), body);
  return svg(view(name!), body, "ib-li-dark") + svg(view(lightName), lightBody, "ib-li-light");
}
