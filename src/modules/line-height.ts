export const LINE_HEIGHT_PRESETS = [
  { value: "theme", label: "主题默认（1.8）", leading: 1.8 },
  { value: "compact", label: "紧凑（1.55）", leading: 1.55 },
  { value: "standard", label: "标准（1.72）", leading: 1.72 },
  { value: "spacious", label: "宽松（1.95）", leading: 1.95 }
] as const;

export function resolveLineHeight(value: string | undefined) {
  return LINE_HEIGHT_PRESETS.find(preset => preset.value === value) || LINE_HEIGHT_PRESETS[0];
}

export function composeLineHeightTokens(value: string | undefined) {
  const preset = resolveLineHeight(value);
  if (preset.value === "theme") return { "--line-height-normal": "var(--ib-text-leading)" };
  return {
    "--ib-text-leading": String(preset.leading),
    "--line-height-normal": "var(--ib-text-leading)"
  };
}

export function applyLineHeightPreference(body: HTMLElement, value: string | undefined) {
  clearLineHeightPreference(body);
  for (const [name, token] of Object.entries(composeLineHeightTokens(value))) body.style.setProperty(name, token);
}

export function clearLineHeightPreference(body: HTMLElement) {
  body.style.removeProperty("--ib-text-leading");
  body.style.removeProperty("--line-height-normal");
}
