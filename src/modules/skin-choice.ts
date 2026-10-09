import { THEME_PRESETS } from './theme-presets.js';

// Keep old saved choices usable without retaining their decoration or fonts.
const LEGACY_GROUPS: Record<string, [string, string[]]> = {
  azure: ['light', ['swiss', 'international-blue', 'engineering', 'business-blue', 'corporate', 'pitch-deck', 'arctic']],
  teal: ['dark', ['glass', 'aurora', 'nord']],
  violet: ['dark', ['neon', 'vaporwave', 'dracula', 'catppuccin-mocha', 'rose-pine']],
  pine: ['dark', ['terminal']],
  amber: ['dark', ['gruvbox']],
  book: ['light', ['retro-tv', 'solarized-light', 'ink-zine', 'magazine', 'editorial', 'academic', 'midcentury', 'japanese']],
  graphite: ['light', ['brutalism', 'minimal-white', 'sharp-mono']],
  terracotta: ['light', ['memphis', 'news', 'bauhaus']],
};
const LEGACY_OVERRIDES: Record<string, string> = {
  'blueprint': 'palette-azure-dark', 'tokyo-night': 'palette-azure-dark',
  'soft-pastel': 'palette-wisteria-light', 'sunset': 'palette-terracotta-light',
  'xiaohongshu': 'palette-terracotta-light', 'rainbow': 'palette-azure-light',
  'y2k': 'palette-wisteria-light', 'catppuccin-latte': 'palette-wisteria-light',
};
export function normalizePresentationSkin(value: unknown): string {
  if (value === 'none' || !value) return 'none';
  if (typeof value !== 'string') return 'none';
  if (THEME_PRESETS.some(p => value === `palette-${p.id}-light` || value === `palette-${p.id}-dark`)) return value;
  if (LEGACY_OVERRIDES[value]) return LEGACY_OVERRIDES[value];
  for (const [preset, [mode, ids]] of Object.entries(LEGACY_GROUPS)) {
    if (ids.includes(value)) {
      const actual = preset === 'violet' ? 'wisteria' : preset;
      return THEME_PRESETS.some(p => p.id === actual) ? `palette-${actual}-${mode}` : 'none';
    }
  }
  return 'none';
}
