/* Interface text in two languages. The Chinese text is the key: `tr("保存")` returns the English from the
   table when the interface is English, and the Chinese itself otherwise (or when a string has no English yet).
   `{name}` marks a value filled in at run time. Pure; the Obsidian side (which language is active) is i18n.ts. */
export type Language = "zh" | "en";
export type Preference = "auto" | Language;
export type Vars = Record<string, string | number>;

export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => name in vars ? String(vars[name]) : whole);
}

/** English for the Chinese key when `language` is English and the table has it; otherwise the key itself. */
export function translateWith(table: Readonly<Record<string, string>>, language: Language, key: string, vars?: Vars): string {
  return fill(language === "en" ? (table[key] ?? key) : key, vars);
}

/** Obsidian reports its interface language as a moment locale such as "zh-cn", "zh-tw" or "en-gb". */
export function languageOfLocale(locale: string): Language {
  return /^zh\b/i.test(locale.trim()) ? "zh" : "en";
}

export function resolveLanguage(preference: Preference | undefined, locale: string): Language {
  return preference === "zh" || preference === "en" ? preference : languageOfLocale(locale);
}
