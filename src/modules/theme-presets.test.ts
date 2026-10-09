import { describe, expect, it } from "vitest";
import { THEME_PRESETS, composeThemeTokens, contrastRatio, presetAccentHex } from "./theme-presets";

describe("完整主题预设", () => {
  it("包含 8 套命名主题，并分别合成浅色与深色令牌", () => {
    expect(THEME_PRESETS).toHaveLength(8);
    for (const preset of THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = composeThemeTokens(preset.id, mode);
        expect(tokens["--ib-bg-primary"]).toBe(mode === "dark" ? preset.darkPaper : preset.lightPaper);
        expect(tokens["--ib-accent-brand"]).toMatch(/^#[0-9A-F]{6}$/);
        expect(tokens["--ib-text-primary"]).toMatch(/^#[0-9A-F]{6}$/);
        expect(Array.from({ length: 8 }, (_, index) => tokens[`--ib-chart-${index + 1}`])).toHaveLength(8);
      }
    }
  });

  it("确保明暗文字、已访问链接和强调按钮达到对比度要求", () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = composeThemeTokens(preset.id, mode);
        const background = tokens["--ib-bg-primary"];
        const minimum = mode === "dark" ? 6 : 4.5;
        for (const name of ["--ib-text-primary", "--ib-text-secondary", "--ib-text-muted", "--ib-text-accent", "--ib-link", "--ib-link-visited"]) {
          const textMinimum = name === "--ib-text-muted" ? 4.5 : minimum;
          expect(contrastRatio(tokens[name], background), `${preset.id}/${mode}/${name}`).toBeGreaterThanOrEqual(textMinimum);
        }
        expect(contrastRatio(tokens["--ib-accent-solid"], tokens["--ib-text-on-accent"]), `${preset.id}/${mode}/button`).toBeGreaterThanOrEqual(4.5);
        for (let index = 1; index <= 8; index += 1) {
          expect(contrastRatio(tokens[`--ib-chart-${index}`], background), `${preset.id}/${mode}/chart-${index}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });


  it("天蓝 Mermaid 的实心图块和淡色卡片分别保证文字达到 4.5:1", () => {
    const mix = (first: string, second: string, amount: number) => {
      const channels = (color: string) => color.slice(1).match(/../g)!.map(channel => parseInt(channel, 16));
      const a = channels(first), b = channels(second);
      return "#" + a.map((value, index) => Math.round(value + (b[index] - value) * amount).toString(16).padStart(2, "0")).join("");
    };
    for (const mode of ["light", "dark"] as const) {
      const tokens = composeThemeTokens("azure", mode);
      const paper = tokens["--ib-mm-canvas"];
      const card = tokens["--ib-mm-card"];
      const surfaces = [paper, card, tokens["--ib-mm-node-fill"], tokens["--ib-mm-note-fill"],
        mix(card, tokens["--ib-accent-brand"], 0.32)];
      for (const name of ["--ib-mm-text", "--ib-mm-muted", "--ib-mm-text-accent"]) {
        for (const surface of surfaces) {
          expect(contrastRatio(tokens[name], surface), `${mode}/${name}/${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (let index = 1; index <= 8; index += 1) {
        const color = tokens[`--ib-mm-series-${index}`];
        // Pie, packet, git labels and treemap labels sit on an opaque mark.
        expect(contrastRatio(tokens["--ib-mm-on-series"], color), `${mode}/mark-${index}`).toBeGreaterThanOrEqual(4.5);
        // Journey headings and colored label pills sit on a tinted card.
        const tint = mix(card, color, 0.22);
        expect(contrastRatio(tokens[`--ib-mm-series-text-${index}`], tint), `${mode}/tint-${index}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(tokens["--ib-mm-muted"], tint), `${mode}/muted-tint-${index}`).toBeGreaterThanOrEqual(4.5);
      }
      // Both engines use a coordinated palette while maintaining distinct series.
      expect(new Set(Array.from({ length: 8 }, (_, i) => tokens[`--ib-chart-${i + 1}`])).size).toBe(8);
    }
    expect(contrastRatio("#FFFFFF", "#626D7E")).toBeGreaterThanOrEqual(4.5);
  });

  it("系列文字与实心强调色为最终像素保留配色对比度余量", () => {
    for (const preset of THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const tokens = composeThemeTokens(preset.id, mode);
        expect(contrastRatio(tokens["--ib-accent-solid"], tokens["--ib-text-on-accent"])).toBeGreaterThanOrEqual(5);
        for (let index = 1; index <= 8; index += 1) {
          expect(contrastRatio(tokens["--ib-mm-on-series"], tokens[`--ib-mm-series-${index}`])).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });

  it("自定义强调色不改变预设纸面，并重新推导强调与图表色", () => {
    const baseline = composeThemeTokens("book", "dark");
    const custom = composeThemeTokens("book", "dark", "#D946EF");
    expect(custom["--ib-bg-primary"]).toBe(baseline["--ib-bg-primary"]);
    expect(custom["--ib-accent-brand"]).not.toBe(baseline["--ib-accent-brand"]);
    expect(custom["--ib-chart-1"]).not.toBe(baseline["--ib-chart-1"]);
    expect(custom["--ib-accent-brand"]).toBe(composeThemeTokens("book", "dark", "#D946EF")["--ib-accent-brand"]);
    expect(presetAccentHex("unknown-preset")).toBe(THEME_PRESETS[0].accent);
  });
});

 it("eight dark palettes meet reading link and chapter rail targets on cards", () => {
   for (const preset of THEME_PRESETS) {
     const tokens = composeThemeTokens(preset.id, "dark");
     for (const surface of ["--ib-bg-primary", "--ib-bg-secondary", "--ib-bg-tertiary"]) {
       for (const link of ["--ib-link", "--ib-link-visited", "--ib-link-broken"])
         expect(contrastRatio(tokens[link], tokens[surface]), `${preset.id}/${link}/${surface}`).toBeGreaterThanOrEqual(6);
     }
     expect(contrastRatio(tokens["--ib-chapter-rail-brand"], tokens["--ib-bg-tertiary"]), preset.id).toBeGreaterThanOrEqual(3);
   }
 });
