export const PAPERS = {
  A3: { label: "A3", w: 297, h: 420 },
  A4: { label: "A4", w: 210, h: 297 },
  GOV: { label: "公文 A4（GB/T 9704）", w: 210, h: 297, margins: { t: 37, r: 26, b: 35, l: 28 } },
  A5: { label: "A5", w: 148, h: 210 },
  A6: { label: "A6", w: 105, h: 148 },
  B5: { label: "B5（JIS）", w: 182, h: 257 },
  LETTER: { label: "Letter", w: 215.9, h: 279.4 },
  LEGAL: { label: "Legal", w: 215.9, h: 355.6 }
} as const;

export const MARGIN_PRESETS = {
  normal: { label: "常规", t: 18, r: 16, b: 20, l: 16 },
  narrow: { label: "窄", t: 12.7, r: 12.7, b: 12.7, l: 12.7 },
  moderate: { label: "适中", t: 25.4, r: 19.1, b: 25.4, l: 19.1 },
  wide: { label: "宽", t: 25.4, r: 50.8, b: 25.4, l: 50.8 },
  gov: { label: "公文", t: 37, r: 26, b: 35, l: 28 }
} as const;

export function paperSize(page: { paper: string; customPaper?: { w: number; h: number }; landscape?: boolean }) {
  const base = page.paper === "CUSTOM" ? page.customPaper : PAPERS[page.paper as keyof typeof PAPERS] || PAPERS.A4;
  if (!base) return PAPERS.A4;
  return page.landscape ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
}

export function paperMarginScale(paper: string): number {
  return paper === "A5" ? 0.78 : paper === "A6" ? 0.55 : 1;
}

export function paperMarginsForPreset(preset: string, paper: string) {
  const source = MARGIN_PRESETS[preset as keyof typeof MARGIN_PRESETS];
  if (!source) return null;
  const scale = paperMarginScale(paper);
  return {
    t: Number((source.t * scale).toFixed(1)),
    r: Number((source.r * scale).toFixed(1)),
    b: Number((source.b * scale).toFixed(1)),
    l: Number((source.l * scale).toFixed(1))
  };
}
