/** The plugin instance, shared by every module (type-only import, erased at build time). */
export type IgnorancePlugin = import("./main.js").IgnoranceBlueMermaidPlugin;

export interface PageState {
  width: "standard" | "full" | "custom" | string;
  customWidth: number;
  zoom: number;
  paged: boolean;
  paper: string;
  customPaper: { w: number; h: number };
  landscape: boolean;
  marginPreset: string;
  margins: { t: number; r: number; b: number; l: number };
  pageNumber: string;
  pageNumberFormat: string;
  runningHeader: string;
  footerText: string;
  breakMode: string;
}

export interface AppearanceState {
  hideHeadingLabels: boolean;
  headingBadge: boolean;
  decorations: boolean;
  tableAlignment: string;
  cardRadius: number;
  themePreset: string;
  fontHeading: string;
  lineHeight: string;
}

export interface TabState {
  openInNewTab: boolean;
  deduplicateTabs: boolean;
  deduplicateAcrossTabGroups: boolean;
}

/** Everything persisted in data.json. */
export interface PluginState {
  density: string;
  tables: Record<string, Record<string, Record<string, unknown>>>;
  accent: string;
  customAccent: string;
  presentation: { skin: string; animation: string; canvas: string; [key: string]: unknown };
  appearance: AppearanceState;
  tabs: TabState;
  page: PageState;
  smartPunctuation: boolean;
  codeLineNumbers: boolean;
  headingNumbers: boolean;
  headingNumberStyle: "decimal" | "chinese";
  headingNumberStart: "auto" | "h1" | "h2";
  headingNumberDepth: number;
  lenientBlocks: boolean;
  tableCrosshair: boolean;
  autoFoldCode: boolean;
  captions: boolean;
  grayDates: string;
  writingModes: { typewriterScroll: boolean; focusMode: boolean };
  fileTools: { apps: string[]; convertPastedImages: boolean };
  webClip: { watchClipboard: boolean; folder: string; byDomain: boolean };
  readingTime: { enabled: boolean };
  introShown: boolean;
  readingPositions?: Record<string, { ratio?: number; [key: string]: unknown }>;
  externalFiles?: Record<string, unknown>;
  htmlSkin?: unknown;
  pageDefaults?: unknown;
}
