// Map colour scales from the design system (plan §08). Validated for CVD: the diverging
// scale is red–teal (not red–green), and meaning is always paired with text/arrows.
import { scaleQuantile, scaleQuantize } from "d3-scale";

// Sequential: Tanjung Aru sand shading into the deep Sulu Sea.
export const LAUT = [
  "#efe8d6", "#d9e6d9", "#bfe0d6", "#a0d4cb", "#7fc5bd", "#5fb3ad",
  "#43a09c", "#2d8a89", "#1f7477", "#155e65", "#0e4a53",
];

// Diverging (percentile, worse -> better): Rafflesia red, sand, Semporna teal.
export const MOGAH_LAUT = [
  "#c0392b", "#d4604c", "#e38a70", "#ecb39a", "#efd3be", "#ede5d0",
  "#c9e3d8", "#9fd3c7", "#6fbfb2", "#3fa598", "#1b8378",
];

// Night lights: unlit forest to lamp-gold.
export const MALAM = [
  "#0f1a1f", "#1f2a24", "#33372a", "#4d4a2c", "#6d5f2d", "#8f762e",
  "#b58f31", "#d8a735", "#ecc158", "#f6dc93", "#fdf1cf",
];

/** Division colours: West Coast sunset, Crocker rainforest, Kudat sand, Kinabatangan orchid, Semporna sea. */
export const DIVISION_COLOR: Record<string, string> = {
  "West Coast": "var(--div-west)",
  Interior: "var(--div-interior)",
  Kudat: "var(--div-kudat)",
  Sandakan: "var(--div-sandakan)",
  Tawau: "var(--div-tawau)",
};

/** Theme-independent division colours for data fills (mid-tones legible on day and night). */
export const DIVISION_HEX: Record<string, string> = {
  "West Coast": "#e8804f",
  Interior: "#4f9e6a",
  Kudat: "#d6b04e",
  Sandakan: "#a47cc6",
  Tawau: "#2fb0a6",
};

export const DIVISIONS = ["West Coast", "Interior", "Kudat", "Sandakan", "Tawau"] as const;

/** Sequential scale for levels; diverging (percentile) scale for 'better/worse' readings. */
export function sequential(domain: [number, number]) {
  return scaleQuantize<string>().domain(domain).range(LAUT.slice(1));
}

/** Equal-count classes for descriptive maps: skewed indicators (density, night lights)
 *  would otherwise put almost every district in the palest class. */
export function sequentialQuantiles(values: number[], palette: "laut" | "lights" = "laut") {
  // Quintiles: with 27 districts, finer classes would hold only two or three each.
  const range = palette === "lights" ? [MALAM[2], MALAM[4], MALAM[6], MALAM[8], MALAM[10]] : [LAUT[1], LAUT[3], LAUT[5], LAUT[7], LAUT[10]];
  return scaleQuantile<string>().domain(values).range(range);
}

/** Percentile (0 = worst, 100 = best) -> diverging Mogah–Laut. */
export function percentileColor(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "var(--nodata)";
  const i = Math.max(0, Math.min(MOGAH_LAUT.length - 1, Math.round((pct / 100) * (MOGAH_LAUT.length - 1))));
  return MOGAH_LAUT[i];
}

/** Text colour that stays legible on a given fill. */
export function inkOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "var(--ink)";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? "#16241f" : "#eef3ef";
}
