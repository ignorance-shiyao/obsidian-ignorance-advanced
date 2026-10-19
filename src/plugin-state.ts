export interface PageState {
  /** "standard", "full", "custom", or a named preset width. */
  width: string;
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
  /** Enhancement kinds the user switched off (only `false` entries are kept). */
  enhance?: Partial<Record<import("./modules/enhancement-gate-core.js").EnhancementKind, boolean>>;
  layouts?: import("./modules/layout-library-core.js").LayoutRecord[];
  userTemplates?: { folder: string; author: string };
  language?: import("./i18n-core.js").Preference;
  layoutTombstones?: import("./modules/layout-library-core.js").LayoutTombstone[];
  pasteLink?: boolean;
  pasteTable?: boolean;
  codeLineNumbers: boolean;
  headingNumbers: boolean;
  headingNumberStyle: "decimal" | "chinese";
  headingNumberStart: "auto" | "h1" | "h2";
  headingNumberDepth: number;
  headingNumberSkipOwn?: boolean;
  lenientBlocks: boolean;
  tableCrosshair: boolean;
  autoFoldCode: boolean;
  captions: boolean;
  grayDates: string;
  customCallouts?: string;
  wordFont: import("./modules/word-font.js").WordFontChoice;
  writingModes: { typewriterScroll: boolean; focusMode: boolean };
  fileTools: { convertPastedImages: boolean; /** Removed setting, deleted on load. */ apps?: unknown };
  webClip: { watchClipboard: boolean; folder: string; byDomain: boolean };
  readingTime: { enabled: boolean };
  introShown: boolean;
  /** Source line last read, per note path (most recent last). */
  readingPositions?: Record<string, number>;
  htmlSkin?: unknown;
  pageDefaults?: unknown;
}

/** Where a rendered block's source sits in its note. */
export interface BlockSource {
  path: string;
  lineStart: number;
  lineEnd: number;
}

/** The column-resize layer attached to one table (see src/plugin/table-sizes.ts). */
export interface TableLayer {
  table: HTMLTableElement;
  seenConnected?: boolean;
  destroy(): void;
}

/** A diagram waiting for its view box to be tightened again. */
export interface RetightenJob {
  container?: HTMLElement;
  state: DiagramState;
  svg: SVGSVGElement;
}

/** Pan / zoom state of one enhanced diagram (see src/plugin/diagram-layout.ts). */
export interface DiagramState {
  svg: SVGSVGElement;
  canvas: HTMLElement;
  container: HTMLElement;
  toolbar: HTMLElement;
  percent: HTMLElement;
  scale: number;
  x: number;
  y: number;
  pointerId: number | null;
  lastX: number;
  lastY: number;
  /** Redraws the transform and the percent label. */
  apply?: () => void;
  cleanup?: () => void;
  disposed?: boolean;
  fitted?: boolean;
  /** Set while the fit is pinned (no refit until the user or a layout change releases it). */
  lockFrame?: boolean;
  /** The diagram is too wide to read at the fitted scale and scrolls sideways instead. */
  readableScroll?: boolean;
  readableMinimum?: number;
  minimumFontPx?: number;
  fitHeightLimit?: number;
  visibility?: IntersectionObserver;
}
