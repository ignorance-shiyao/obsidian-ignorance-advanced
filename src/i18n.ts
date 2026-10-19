import { moment } from "obsidian";
import { EN } from "./i18n-en.js";
import { resolveLanguage, translateWith, type Language, type Preference, type Vars } from "./i18n-core.js";

let preference: Preference = "auto";

export function setLanguagePreference(next: Preference | undefined) { preference = next === "zh" || next === "en" ? next : "auto"; }

export function activeLanguage(): Language { return resolveLanguage(preference, moment.locale()); }

/** The text for the active interface language; see i18n-core.ts. */
export function tr(zh: string, vars?: Vars): string { return translateWith(EN, activeLanguage(), zh, vars); }

/** Marks a Chinese string kept in module-level data and translated where it is shown: `tr(label)`. Returns the text unchanged. */
export function zh(text: string): string { return text; }
