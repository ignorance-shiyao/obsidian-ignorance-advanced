const LIGHT_PAGE = "#FAFBFD";
const DARK_PAGE = "#0F172A";

function accentRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}
function accentHex(rgb) {
  return "#" + rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function accentLuminance(hex) {
  const [r, g, b] = accentRgb(hex).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function accentContrast(a, b) {
  const [hi, lo] = [accentLuminance(a), accentLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
function accentMix(hex, target, amount) {
  const a = accentRgb(hex), b = accentRgb(target);
  return accentHex(a.map((v, i) => v + (b[i] - v) * amount));
}
function accentStep(hex, toward, against, ratio) {
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const candidate = accentMix(hex, toward, t);
    if (accentContrast(candidate, against) >= ratio) return candidate;
  }
  return toward;
}
export function derivePalette(hex, surfaces = {}) {
  const lightPage = surfaces.lightPage || LIGHT_PAGE;
  const darkPage = surfaces.darkPage || DARK_PAGE;
  const lightSolid = accentStep(hex, "#000000", "#FFFFFF", 5);
  const darkBrand = accentStep(hex, "#FFFFFF", darkPage, 3);
  let darkSolid = darkBrand;
  let darkOn = accentContrast(darkSolid, "#FFFFFF") >= accentContrast(darkSolid, "#0B1220") ? "#FFFFFF" : "#0B1220";
  if (accentContrast(darkSolid, darkOn) < 5) {
    darkSolid = accentStep(darkBrand, "#000000", "#FFFFFF", 5);
    darkOn = "#FFFFFF";
  }
  return {
    "--ibc-light-brand": hex,
    "--ibc-light-solid": lightSolid,
    "--ibc-light-text": accentStep(hex, "#000000", lightPage, 4.5),
    "--ibc-light-on": "#FFFFFF",
    "--ibc-dark-brand": darkBrand,
    "--ibc-dark-solid": darkSolid,
    "--ibc-dark-text": accentStep(hex, "#FFFFFF", darkPage, 6),
    "--ibc-dark-on": darkOn
  };
}
