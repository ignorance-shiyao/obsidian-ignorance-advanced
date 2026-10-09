/* Body, interface and code fonts come from Obsidian's own Appearance settings
   (the theme supplies CJK-friendly defaults when those are empty). Obsidian
   has no separate heading font, so that is the only font preference here. */

export const HEADING_FONTS = [
  { value: "match-text", label: "跟随正文", stack: "var(--font-text)" },
  {
    value: "system-sans",
    label: "系统黑体",
    stack: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif'
  },
  {
    value: "rice-serif",
    label: "宣纸宋体",
    stack: '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif'
  },
  { value: "theme", label: "跟随主题", stack: null }
] as const;

export const HEADING_FONT_OPTIONS = HEADING_FONTS.map(({ value, label }) => [value, label]);

const TOKEN_NAMES = ["--ib-font-heading", "--inline-title-font", ...Array.from({ length: 6 }, (_, index) => `--h${index + 1}-font`)];

export function composeFontTokens(preferences: { fontHeading?: string } = {}) {
  const heading = HEADING_FONTS.find(font => font.value === preferences.fontHeading);
  if (!heading?.stack) return {};
  return {
    "--ib-font-heading": heading.stack,
    "--inline-title-font": "var(--ib-font-heading)",
    ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`--h${index + 1}-font`, "var(--ib-font-heading)"]))
  };
}

export function applyFontPreferences(body, preferences) {
  clearFontPreferences(body);
  for (const [name, value] of Object.entries(composeFontTokens(preferences))) body.style.setProperty(name, value);
}

export function clearFontPreferences(body) {
  for (const name of TOKEN_NAMES) body.style.removeProperty(name);
}

// Earlier versions had body / code font presets. Carry a non-default choice
// over to Obsidian's own setting once, so nobody's notes change look.
export const LEGACY_FONT_STACKS = {
  text: { "rice-serif": '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC"' },
  mono: { "modern-mono": '"Cascadia Code", "SFMono-Regular", Menlo, Consolas' }
};

export function migrateLegacyFonts(app, appearance) {
  const moves = [["fontText", "textFontFamily", LEGACY_FONT_STACKS.text], ["fontMono", "monospaceFontFamily", LEGACY_FONT_STACKS.mono]];
  let changed = false;
  for (const [key, config, stacks] of moves) {
    if (!(key in appearance)) continue;
    const stack = stacks[appearance[key]];
    if (stack && !app.vault.getConfig(config)) app.vault.setConfig(config, stack);
    delete appearance[key];
    changed = true;
  }
  if (changed) app.workspace.trigger("css-change");
  return changed;
}
