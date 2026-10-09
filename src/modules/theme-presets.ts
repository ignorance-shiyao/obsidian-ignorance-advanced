import { derivePalette } from "./accent-palette.js";

/* The eight curated palettes. Each is tuned by hand for its paper, ink and
   accent in both modes; everything else (surfaces, borders, diagram and chart
   colours) is derived from these so the theme, slides and exports agree. */
export const THEME_PRESETS = [
  { id: "azure", label: "天蓝", accent: "#3B6FE8", lightPaper: "#F5F8FD", darkPaper: "#0E1420", lightInk: "#123258", darkInk: "#EAF3FF" },
  { id: "pine", label: "松绿", accent: "#2E7D5B", lightPaper: "#F7FAF7", darkPaper: "#0F1A16", lightInk: "#1F2C26", darkInk: "#E6F0EA" },
  { id: "book", label: "书卷", accent: "#8B5E34", lightPaper: "#FBF7EE", darkPaper: "#1C1914", lightInk: "#2F2A22", darkInk: "#EFE7D8" },
  { id: "graphite", label: "石墨", accent: "#4A5568", lightPaper: "#FAFAFA", darkPaper: "#121315", lightInk: "#1F2328", darkInk: "#E8E9EB" },
  { id: "terracotta", label: "赤陶", accent: "#B4533C", lightPaper: "#FBF6F2", darkPaper: "#1E1715", lightInk: "#33241F", darkInk: "#F3E7E1" },
  { id: "teal", label: "深海青", accent: "#177E89", lightPaper: "#F5F9FA", darkPaper: "#0D1A1D", lightInk: "#1B2E31", darkInk: "#E3F1F2" },
  { id: "wisteria", label: "紫藤", accent: "#6A55B5", lightPaper: "#F9F8FC", darkPaper: "#16131F", lightInk: "#282339", darkInk: "#ECE8F7" },
  { id: "amber", label: "琥珀", accent: "#B26B12", lightPaper: "#FCF8F0", darkPaper: "#1D1812", lightInk: "#33291B", darkInk: "#F3EADB" }
] as const;

export const THEME_TOKEN_NAMES = [
  "--ib-bg-primary", "--ib-bg-secondary", "--ib-bg-tertiary", "--ib-bg-chrome", "--ib-bg-input",
  "--ib-bg-code-inline", "--ib-bg-code-block", "--ib-bg-hover", "--ib-bg-active", "--ib-bg-selection",
  "--ib-bg-drag", "--ib-text-primary", "--ib-text-secondary", "--ib-text-muted", "--ib-text-disabled",
  "--ib-text-accent", "--ib-text-on-accent", "--ib-link", "--ib-link-visited", "--ib-link-broken",
  "--ib-chapter-rail-brand", "--ib-accent-brand", "--ib-accent-solid", "--ib-accent-subtle", "--ib-border-default",
  "--ib-border-strong", "--ib-divider", "--ib-focus", "--ib-accent-purple", "--ib-accent-teal",
  "--ib-file-md", "--ib-page-desk", "--ib-page-paper", "--ib-mm-canvas", "--ib-mm-text",
  "--ib-mm-muted", "--ib-mm-card", "--ib-mm-node-fill", "--ib-mm-node-stroke", "--ib-mm-cluster-fill",
  "--ib-mm-cluster-stroke", "--ib-mm-alt-fill", "--ib-mm-note-fill", "--ib-mm-note-stroke",
  "--ib-mm-line", "--ib-mm-arrow", "--ib-mm-active-fill", "--ib-mm-active-stroke",
  "--ib-mm-on-series", "--ib-mm-accent-stroke", "--ib-mm-text-accent", "--ib-syntax-function",
  ...Array.from({ length: 8 }, (_, index) => "--ib-mm-series-" + (index + 1)),
  ...Array.from({ length: 8 }, (_, index) => "--ib-mm-series-text-" + (index + 1)),
  ...Array.from({ length: 8 }, (_, index) => "--ib-chart-" + (index + 1))
];

function rgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const value = raw.length === 3 ? raw.split("").map(char => char + char).join("") : raw;
  return [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16)) as [number, number, number];
}

function hex(channels: number[]): string {
  return "#" + channels.map(value => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function mix(first: string, second: string, amount: number): string {
  const a = rgb(first);
  const b = rgb(second);
  return hex(a.map((value, index) => value + (b[index] - value) * amount));
}

function toneForContrast(ink: string, paper: string, minimum: number): string {
  let result = ink;
  for (let amount = 0.01; amount <= 1; amount += 0.01) {
    const candidate = mix(ink, paper, amount);
    if (contrastRatio(candidate, paper) < minimum) break;
    result = candidate;
  }
  return result;
}

// Labels may sit on a tinted card rather than the page. Preserve their hue
// while moving toward the mode's ink until every relevant surface is readable.
function contrastOnSurfaces(color: string, surfaces: string[], dark: boolean, minimum = 5): string {
  const target = dark ? "#FFFFFF" : "#000000";
  for (let step = 0; step <= 100; step += 1) {
    const candidate = mix(color, target, step / 100);
    if (surfaces.every(surface => contrastRatio(candidate, surface) >= minimum)) return candidate;
  }
  return target;
}

function luminance(color: string): number {
  const channels = rgb(color).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(first: string, second: string): number {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

function rgbToHsl(color: string): [number, number, number] {
  const [r, g, b] = rgb(color).map(value => value / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (delta) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return [(h + 360) % 360, s, l];
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const section = Math.floor(h / 60);
  const values = section === 0 ? [c, x, 0] : section === 1 ? [x, c, 0] : section === 2 ? [0, c, x] :
    section === 3 ? [0, x, c] : section === 4 ? [x, 0, c] : [c, 0, x];
  return hex(values.map(value => (value + m) * 255));
}

function seriesColors(accent: string, background: string, dark: boolean): string[] {
  const [hue, saturation] = rgbToHsl(accent);
  const offsets = [0, -24, 24, -48, 48, 150, 180, 210];
  return offsets.map(offset => {
    let lightness = dark ? 0.66 : 0.46;
    const sat = Math.max(0.35, Math.min(0.56, saturation));
    let color = hslToHex(hue + offset, sat, lightness);
    for (let attempt = 0; attempt < 20 && contrastRatio(color, background) < 3; attempt += 1) {
      lightness += dark ? 0.015 : -0.015;
      color = hslToHex(hue + offset, sat, lightness);
    }
    return color;
  });
}

export function resolveThemePreset(id: string) {
  return THEME_PRESETS.find(preset => preset.id === id) || THEME_PRESETS[0];
}

export function composeThemeTokens(id: string, mode: "light" | "dark", accentOverride?: string): Record<string, string> {
  const preset = resolveThemePreset(id);
  const dark = mode === "dark";
  const paper = dark ? preset.darkPaper : preset.lightPaper;
  const ink = dark ? preset.darkInk : preset.lightInk;
  const accent = accentOverride || preset.accent;
  const palette = derivePalette(accent, { lightPage: preset.lightPaper, darkPage: preset.darkPaper });
  const brand = dark ? palette["--ibc-dark-brand"] : palette["--ibc-light-brand"];
  const solid = dark ? palette["--ibc-dark-solid"] : palette["--ibc-light-solid"];
  const baseTextAccent = dark ? palette["--ibc-dark-text"] : palette["--ibc-light-text"];
  const onAccent = dark ? palette["--ibc-dark-on"] : palette["--ibc-light-on"];
  const colors = seriesColors(accent, paper, dark);
  const secondary = dark ? mix(paper, "#FFFFFF", 0.055) : mix(paper, accent, 0.035);
  const tertiary = dark ? mix(paper, "#FFFFFF", 0.095) : mix(paper, "#FFFFFF", 0.62);
  const codeBlock = dark ? mix(paper, "#000000", 0.2) : mix(paper, accent, 0.035);
  const subtle = dark ? mix(paper, brand, 0.18) : mix(tertiary, brand, 0.1);
  const border = dark ? mix(paper, "#FFFFFF", 0.19) : mix(paper, ink, 0.15);
  const borderStrong = dark ? mix(paper, "#FFFFFF", 0.3) : mix(paper, ink, 0.27);
  // Dark diagrams: connectors and outlines are lifted well clear of the canvas;
  // at the accent's own lightness they sank into it.
  const chartLine = dark ? mix(paper, "#C9D6EE", 0.8) : mix(paper, "#65748B", 0.7);
  const strokeAccent = dark ? mix(brand, "#FFFFFF", 0.3) : brand;
  // The desk around the paper leans toward the preset's accent instead of a neutral grey.
  const pageDesk = dark ? mix(mix(paper, "#000000", 0.4), brand, 0.08) : mix(mix(paper, brand, 0.11), "#000000", 0.025);
  const pagePaper = dark ? mix(paper, "#FFFFFF", 0.055) : mix(paper, "#FFFFFF", 0.52);
  const secondaryInk = toneForContrast(ink, paper, 6);
  const mutedInk = toneForContrast(ink, paper, 4.5);
  const disabledInk = toneForContrast(ink, paper, 3);
  const selected = mix(paper, brand, dark ? 0.38 : 0.22);
  const active = mix(paper, brand, dark ? 0.23 : 0.14);
  const hover = mix(paper, brand, dark ? 0.14 : 0.08);
  const note = mix(paper, colors[2], dark ? 0.15 : 0.1);
  const noteStroke = mix(paper, colors[2], dark ? 0.42 : 0.4);
  const visitedPalette = derivePalette(colors[6], { lightPage: preset.lightPaper, darkPage: preset.darkPaper });
  const readingSurfaces = [paper, secondary, tertiary, subtle, hover, active, selected, note, codeBlock];
  const textAccent = dark ? contrastOnSurfaces(baseTextAccent, readingSurfaces, true, 6) : contrastOnSurfaces(baseTextAccent, [paper, secondary, tertiary, codeBlock], false, 4.6);
  const baseVisited = dark ? visitedPalette["--ibc-dark-text"] : visitedPalette["--ibc-light-text"];
  const visitedLink = dark ? contrastOnSurfaces(baseVisited, readingSurfaces, true, 6) : baseVisited;
  // Mermaid puts labels directly on marks, unlike ECharts. Keep its ramp
  // separate so accessibility corrections do not change chart palettes.
  const onSeries = dark ? "#10151F" : "#FFFFFF";
  const diagramColors = colors.map(color => {
    const target = dark ? "#FFFFFF" : "#000000";
    for (let step = 0; step <= 100; step += 1) {
      const candidate = mix(color, target, step / 100);
      if (contrastRatio(onSeries, candidate) >= 5) return candidate;
    }
    return target;
  });
  const diagramCard = dark ? mix(mix(paper, "#FFFFFF", 0.08), brand, 0.12) : tertiary;
  const diagramNode = dark ? mix(paper, brand, 0.3) : subtle;
  const diagramSurfaces = [paper, diagramCard, diagramNode, secondary, note, codeBlock,
    mix(diagramCard, brand, 0.32), ...diagramColors.map(color => mix(diagramCard, color, 0.22))];
  const diagramMuted = contrastOnSurfaces(secondaryInk, diagramSurfaces, dark);
  const diagramAccentText = contrastOnSurfaces(textAccent,
    [paper, diagramCard, diagramNode, secondary, note, codeBlock, mix(diagramCard, brand, 0.32)], dark);
  // Code sits on a block that fades from an accent tint into the code surface;
  // the brand colour itself is too light or too dark there, so the function
  // token is toned against the tinted end as well.
  const syntaxFunction = contrastOnSurfaces(brand, [paper, codeBlock, mix(codeBlock, brand, 0.3)], dark, 4.6);
  const result: Record<string, string> = {
    "--ib-bg-primary": paper,
    "--ib-bg-secondary": secondary,
    "--ib-bg-tertiary": tertiary,
    "--ib-bg-chrome": secondary,
    "--ib-bg-input": dark ? mix(paper, "#FFFFFF", 0.035) : tertiary,
    "--ib-bg-code-inline": dark ? mix(paper, brand, 0.12) : mix(tertiary, brand, 0.09),
    "--ib-bg-code-block": codeBlock,
    "--ib-bg-hover": hover,
    "--ib-bg-active": active,
    "--ib-bg-selection": selected,
    "--ib-bg-drag": mix(paper, brand, dark ? 0.28 : 0.18),
    "--ib-text-primary": ink,
    "--ib-text-secondary": secondaryInk,
    "--ib-text-muted": mutedInk,
    "--ib-text-disabled": disabledInk,
    "--ib-text-accent": textAccent,
    "--ib-text-on-accent": onAccent,
    "--ib-link": textAccent,
    "--ib-link-visited": visitedLink,
    "--ib-link-broken": dark ? contrastOnSurfaces("#F08A94", readingSurfaces, true, 6) : "#B3434F",
    "--ib-chapter-rail-brand": dark ? contrastOnSurfaces(brand, [tertiary], true, 3.05) : brand,
    "--ib-accent-brand": brand,
    "--ib-accent-solid": solid,
    "--ib-accent-subtle": subtle,
    "--ib-border-default": border,
    "--ib-border-strong": borderStrong,
    "--ib-divider": "color-mix(in srgb, var(--ib-border-default) 60%, transparent)",
    "--ib-focus": dark ? textAccent : brand,
    "--ib-accent-purple": colors[6],
    "--ib-accent-teal": colors[2],
    "--ib-file-md": brand,
    "--ib-page-desk": pageDesk,
    "--ib-page-paper": pagePaper,
    "--ib-mm-canvas": paper,
    "--ib-mm-text": ink,
    "--ib-mm-muted": diagramMuted,
    // A neutral card reads as a lifted, faintly tinted panel, not a black hole.
    "--ib-mm-card": diagramCard,
    "--ib-mm-node-fill": diagramNode,
    "--ib-mm-node-stroke": dark ? mix(paper, strokeAccent, 0.85) : mix(tertiary, brand, 0.42),
    "--ib-mm-cluster-fill": secondary,
    "--ib-mm-cluster-stroke": dark ? mix(borderStrong, strokeAccent, 0.35) : borderStrong,
    "--ib-mm-alt-fill": codeBlock,
    "--ib-mm-note-fill": note,
    "--ib-mm-note-stroke": noteStroke,
    "--ib-mm-line": chartLine,
    "--ib-mm-arrow": dark ? mix(chartLine, "#FFFFFF", 0.24) : mix(chartLine, brand, 0.35),
    "--ib-mm-accent-stroke": strokeAccent,
    "--ib-mm-active-fill": subtle,
    "--ib-mm-active-stroke": solid,
    "--ib-mm-on-series": onSeries,
    "--ib-mm-text-accent": diagramAccentText,
    "--ib-syntax-function": syntaxFunction
  };
  colors.forEach((color, index) => { result["--ib-chart-" + (index + 1)] = color; });
  diagramColors.forEach((color, index) => {
    result["--ib-mm-series-" + (index + 1)] = color;
    result["--ib-mm-series-text-" + (index + 1)] = contrastOnSurfaces(color, [paper, mix(diagramCard, color, 0.22)], dark);
  });
  return result;
}

export function presetAccentHex(id: string): string {
  return resolveThemePreset(id).accent;
}
