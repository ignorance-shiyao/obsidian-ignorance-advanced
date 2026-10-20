/* The user's own layouts: a named copy of the page settings (width, paper, margins, header and footer) and the
   Word font. Colours are not part of a layout, so changing layout never changes the palette. Pure functions. */
import { MARGIN_PRESETS, PAPERS, paperMarginsForPreset } from "./paper.js";
import { WORD_FONT_OPTIONS, normalizeWordFont, type WordFontChoice } from "./word-font.js";

export const LAYOUT_VERSION = 1;

export interface LayoutSettings {
  width: string; customWidth: number; paged: boolean;
  paper: string; customPaper: { w: number; h: number }; landscape: boolean;
  marginPreset: string; margins: { t: number; r: number; b: number; l: number };
  pageNumber: string; pageNumberFormat: string; runningHeader: string; footerText: string; breakMode: string;
  wordFont: WordFontChoice;
}
/** `updatedAt` (ms) is what lets two devices decide which copy of the same layout is newer. */
export interface LayoutRecord { id: string; name: string; settings: Partial<LayoutSettings>; updatedAt?: number }
/** A deleted layout is remembered by id, so a device that still has it does not bring it back on the next sync. */
export interface LayoutTombstone { id: string; at: number }
export type PageLike = Omit<LayoutSettings, "wordFont"> & Record<string, unknown>;

const ONE_OF = {
  width: ["narrow", "standard", "wide", "custom"],
  pageNumber: ["none", "center", "right"],
  pageNumberFormat: ["plain", "total", "gov", "zh"],
  runningHeader: ["none", "chapter"],
  breakMode: ["whitespace", "cut"]
} as const;

export const LAYOUT_LABELS: Record<keyof LayoutSettings, string> = {
  width: "阅读宽度", customWidth: "自定义宽度", paged: "分页阅读", paper: "纸张", customPaper: "自定义纸张尺寸", landscape: "横向",
  marginPreset: "页边距", margins: "页边距数值", pageNumber: "页码位置", pageNumberFormat: "页码格式",
  runningHeader: "页眉", footerText: "页脚", breakMode: "内容跨页", wordFont: "Word 字体"
};

const KEYS = Object.keys(LAYOUT_LABELS) as (keyof LayoutSettings)[];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const inRange = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

/** Copies the layout part of the page settings, so later edits to the page do not change the saved layout. */
export function snapshotLayout(page: PageLike, wordFont: unknown): LayoutSettings {
  return {
    width: page.width, customWidth: page.customWidth, paged: page.paged === true,
    paper: page.paper, customPaper: { ...page.customPaper }, landscape: page.landscape === true,
    marginPreset: page.marginPreset, margins: { ...page.margins },
    pageNumber: page.pageNumber, pageNumberFormat: page.pageNumberFormat, runningHeader: page.runningHeader || "none",
    footerText: page.footerText || "", breakMode: page.breakMode, wordFont: normalizeWordFont(wordFont)
  };
}

/** Checks one layout read from a file; returns only the fields that are valid, and the names of fields it dropped. */
export function sanitizeLayout(raw: unknown): { settings: Partial<LayoutSettings>; dropped: string[] } {
  const settings: Record<string, unknown> = {};
  const dropped: string[] = [];
  const source = isRecord(raw) ? raw : {};
  for (const key of Object.keys(source)) if (!KEYS.includes(key as keyof LayoutSettings)) dropped.push(key);
  const take = (key: keyof LayoutSettings, ok: boolean) => { if (key in source) { if (ok) settings[key] = source[key]; else dropped.push(key); } };
  for (const key of ["width", "pageNumber", "pageNumberFormat", "runningHeader", "breakMode"] as const) {
    take(key, (ONE_OF[key] as readonly unknown[]).includes(source[key]));
  }
  take("customWidth", inRange(source.customWidth, 30, 100));
  take("paged", typeof source.paged === "boolean");
  take("landscape", typeof source.landscape === "boolean");
  take("paper", typeof source.paper === "string" && (source.paper === "CUSTOM" || source.paper in PAPERS));
  take("marginPreset", typeof source.marginPreset === "string" && (source.marginPreset === "custom" || source.marginPreset in MARGIN_PRESETS));
  take("footerText", typeof source.footerText === "string" && source.footerText.length <= 200);
  const paper = source.customPaper;
  take("customPaper", isRecord(paper) && inRange(paper.w, 20, 2000) && inRange(paper.h, 20, 2000));
  if (isRecord(paper) && "customPaper" in settings) settings.customPaper = { w: paper.w, h: paper.h };
  const margins = source.margins;
  take("margins", isRecord(margins) && (["t", "r", "b", "l"] as const).every(side => inRange(margins[side], 0, 200)));
  if (isRecord(margins) && "margins" in settings) settings.margins = { t: margins.t, r: margins.r, b: margins.b, l: margins.l };
  if ("wordFont" in source) settings.wordFont = normalizeWordFont(source.wordFont);
  return { settings: settings, dropped };
}

const NAMES: Record<string, string> = {
  narrow: "窄", standard: "标准", wide: "宽", custom: "自定义", none: "不显示", center: "居中", right: "靠右", chapter: "章节名",
  plain: "1", total: "1 / N", gov: "- 1 -", zh: "第 1 页", whitespace: "整块移到下一页", cut: "在页底切开", CUSTOM: "自定义",
  ...Object.fromEntries(Object.entries(PAPERS).map(([id, paper]) => [id, paper.label])),
  ...Object.fromEntries(Object.entries(MARGIN_PRESETS).map(([id, preset]) => [id, preset.label])),
  ...Object.fromEntries(WORD_FONT_OPTIONS)
};

/** The fields a layout would change on the current settings, as "label: from → to" rows. */
export function layoutChanges(current: LayoutSettings, next: Partial<LayoutSettings>): { label: string; from: string; to: string }[] {
  const plain = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
  const show = (value: unknown): string => typeof value === "boolean" ? (value ? "开" : "关")
    : isRecord(value) ? Object.entries(value).map(([key, item]) => `${key}${plain(item)}`).join(" ") : (NAMES[plain(value)] ?? plain(value)) || "无";
  // Margin numbers only matter when set by hand; a named preset already says it.
  const byHand = next.marginPreset === "custom" || (!("marginPreset" in next) && current.marginPreset === "custom");
  return KEYS.filter(key => key in next && (key !== "margins" || byHand) && JSON.stringify(current[key]) !== JSON.stringify(next[key]))
    .map(key => ({ label: LAYOUT_LABELS[key], from: show(current[key]), to: show(next[key]) }));
}

/** Whether the page settings already equal a layout (nothing in it would change). */
export function layoutMatches(current: LayoutSettings, next: Partial<LayoutSettings>): boolean {
  return layoutChanges(current, next).length === 0;
}

/** A layout by id or name (case does not matter); `aliases` gives other names a layout answers to. */
export function findLayout(list: LayoutRecord[], key: string, aliases: (record: LayoutRecord) => string[] = () => []): LayoutRecord | undefined {
  const wanted = key.trim().toLowerCase();
  if (!wanted) return undefined;
  return list.find(item => item.id.toLowerCase() === wanted) ?? list.find(item => [item.name, ...aliases(item)].some(name => name.toLowerCase() === wanted));
}

/** Writes a layout onto the page settings; margins follow the paper unless they were set by hand. */
export function applyLayout(page: PageLike, settings: Partial<LayoutSettings>) {
  const { wordFont: _wordFont, ...pageFields } = settings;
  Object.assign(page, pageFields);
  if (page.marginPreset !== "custom") {
    const margins = paperMarginsForPreset(page.marginPreset, page.paper);
    if (margins) page.margins = margins;
  }
}

export function uniqueLayoutName(name: string, existing: string[]): string {
  const base = name.trim().slice(0, 40) || "我的版式";
  let candidate = base;
  for (let index = 2; existing.includes(candidate); index += 1) candidate = `${base} ${index}`;
  return candidate;
}

export function exportLayouts(layouts: LayoutRecord[]): string {
  return JSON.stringify({ ibpLayoutVersion: LAYOUT_VERSION, layouts: layouts.map(({ name, settings }) => ({ name, settings })) }, null, 2);
}

export interface ImportResult { layouts: { name: string; settings: Partial<LayoutSettings> }[]; dropped: string[]; error?: string }

/** Reads a layout file. Unknown or invalid fields are dropped and reported; a newer file version is refused. */
export function importLayouts(text: string): ImportResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { layouts: [], dropped: [], error: "文件不是有效的 JSON" }; }
  if (!isRecord(data) || !Array.isArray(data.layouts)) return { layouts: [], dropped: [], error: "文件里没有版式" };
  if (typeof data.ibpLayoutVersion !== "number" || data.ibpLayoutVersion > LAYOUT_VERSION) return { layouts: [], dropped: [], error: "版式文件的版本比当前插件新，请先更新插件" };
  const layouts: ImportResult["layouts"] = [];
  const dropped: string[] = [];
  for (const item of data.layouts) {
    const name = isRecord(item) && typeof item.name === "string" ? item.name.trim() : "";
    if (!isRecord(item) || !name) { dropped.push("缺少名称的版式"); continue; }
    const result = sanitizeLayout(item.settings);
    dropped.push(...result.dropped.map(key => `${name}：${key}`));
    if (Object.keys(result.settings).length) layouts.push({ name: name.slice(0, 40), settings: result.settings });
  }
  return { layouts, dropped };
}

/** Layouts read back from data.json: anything malformed is dropped rather than trusted. */
export function cleanLayouts(raw: unknown): LayoutRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: LayoutRecord[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string" || !item.name.trim()) continue;
    const { settings } = sanitizeLayout(item.settings);
    if (!Object.keys(settings).length) continue;
    const updatedAt = typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : undefined;
    records.push({ id: typeof item.id === "string" && item.id ? item.id : `layout-${records.length + 1}`, name: item.name.trim().slice(0, 40), settings, ...(updatedAt === undefined ? {} : { updatedAt }) });
  }
  return records;
}

export function cleanTombstones(raw: unknown): LayoutTombstone[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LayoutTombstone => isRecord(item) && typeof item.id === "string" && typeof item.at === "number" && Number.isFinite(item.at))
    .map(({ id, at }) => ({ id, at }));
}

const TOMBSTONE_KEEP_MS = 90 * 24 * 3600 * 1000;

/** Merges this device's layouts with the ones another device synced: layouts are matched by id, the newer
    `updatedAt` wins, a deletion beats an edit that is not newer than it, and two different layouts that ended up
    with the same name are told apart by id order, so every device settles on the same names. */
export function mergeLayouts(local: LayoutRecord[], remote: LayoutRecord[], localTombs: LayoutTombstone[], remoteTombs: LayoutTombstone[], now = Date.now()) {
  const tombs = new Map<string, number>();
  for (const { id, at } of [...localTombs, ...remoteTombs]) tombs.set(id, Math.max(at, tombs.get(id) ?? 0));
  const byId = new Map<string, LayoutRecord>();
  for (const record of local) byId.set(record.id, record);
  for (const record of remote) {
    const mine = byId.get(record.id);
    if (!mine || (record.updatedAt ?? 0) > (mine.updatedAt ?? 0)) byId.set(record.id, record);
  }
  const alive = [...byId.values()].filter(record => (tombs.get(record.id) ?? -1) < (record.updatedAt ?? 0));
  const order = new Map(alive.map((record, index) => [record.id, index] as const));
  const used = new Set<string>();
  const named = new Map<string, string>();
  for (const record of [...alive].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const name = used.has(record.name) ? uniqueLayoutName(record.name, [...used]) : record.name;
    used.add(name);
    named.set(record.id, name);
  }
  const position = (record: LayoutRecord) => order.get(record.id) ?? 0;
  const layouts = alive.sort((a, b) => position(a) - position(b)).map(record => { const name = named.get(record.id) ?? record.name; return name === record.name ? record : { ...record, name }; });
  const tombstones = [...tombs].filter(([, at]) => now - at < TOMBSTONE_KEEP_MS).map(([id, at]) => ({ id, at }));
  return { layouts, tombstones };
}
