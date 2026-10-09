// Language icons (Material Icon Theme, MIT) for the picker and every code header. The data file is
// read the first time an icon is needed; languages without an icon get the shared Lucide glyph.
import { LANGUAGES } from "./language-picker.js";
import { iconMarkup, loadPack, type IconPack } from "./icon-library.js";
import { setIcon, UI_ICONS } from "./ui-icons.js";

const FILE = "language-icons.json";
let pack: IconPack | null = null;
let host: any = null;
const waiting = new Set<() => void>();

export function setLanguageIconHost(plugin) { host = plugin; }

export function loadLanguageIcons(plugin = host): Promise<void> {
  if (pack) return Promise.resolve();
  if (!plugin) return Promise.reject(new Error("language icons: no plugin"));
  return loadPack(plugin, FILE).then(loaded => { pack = loaded; waiting.forEach(fill => fill()); waiting.clear(); });
}

// Fence words are lowercase ids or file extensions; our own list adds the friendlier aliases.
let known: Map<string, string> | null = null;
function canonical(language: string) {
  if (!known) {
    known = new Map();
    for (const entry of LANGUAGES) { known.set(entry.id.toLowerCase(), entry.id); for (const alias of entry.aliases || []) known.set(alias.toLowerCase(), entry.id); }
  }
  const key = (language || "").toLowerCase();
  return { key, id: (known.get(key) ?? key).toLowerCase() };
}

function iconName(language: string): string | null {
  if (!pack) return null;
  const { key, id } = canonical(language);
  return pack.lang[key] || pack.lang[id] || null;
}

// Complete markup once the data is loaded; null before that, or for a language without an icon.
export function languageIconSvg(language: string): string | null {
  return pack ? iconMarkup(pack, iconName(language)) : null;
}

// An icon element for a language. It fills in as soon as the data arrives.
export function createLanguageIcon(language: string): HTMLElement {
  const span = document.createElement("span");
  span.className = "ib-lang-icon";
  span.setAttribute("aria-hidden", "true");
  const generic = () => { setIcon(span, UI_ICONS.code); span.classList.add("is-generic"); };
  const fill = () => { const markup = languageIconSvg(language); if (markup) span.innerHTML = markup; else generic(); };
  if (pack) fill();
  else {
    waiting.add(fill);
    loadLanguageIcons().catch(() => { waiting.delete(fill); generic(); });
  }
  return span;
}
