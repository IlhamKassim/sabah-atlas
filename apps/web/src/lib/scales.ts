// Map colour scales from the design system (plan §08). Validated for CVD: the diverging
// scale is red–teal (not red–green), and meaning is always paired with text/arrows.
import { scaleQuantile, scaleQuantize } from "d3-scale";

export const LAUT = [
  "#f3ede1", "#d3e3dc", "#b0d6cf", "#8fc9c1", "#6bb3ad", "#4a9796",
  "#2e7f81", "#16686d", "#0f5a60", "#0c4a53", "#0b3a45",
];

export const MOGAH_LAUT = [
  "#a3362b", "#bd6556", "#d39c8b", "#e5c1b1", "#eedccd", "#f3ede1",
  "#d5e3dd", "#b1d5cd", "#83bbb4", "#4a9796", "#0f6b6e",
];

export const MALAM = [
  "#0f1a1f", "#241f1b", "#3a2e1f", "#553f22", "#6f5226", "#8f6a2b",
  "#b58733", "#d8a031", "#e6c07a", "#efdcb2", "#f3ede1",
];

export const DIVISION_COLOR: Record<string, string> = {
  "West Coast": "var(--div-west)",
  Interior: "var(--div-interior)",
  Kudat: "var(--div-kudat)",
  Sandakan: "var(--div-sandakan)",
  Tawau: "var(--div-tawau)",
};

export const DIVISION_HEX: Record<string, string> = {
  "West Coast": "#1f6f78",
  Interior: "#2e5b3c",
  Kudat: "#a34a2b",
  Sandakan: "#7a5c2e",
  Tawau: "#2f5f7a",
};

export const DIVISIONS = ["West Coast", "Interior", "Kudat", "Sandakan", "Tawau"] as const;

/** Sequential scale for levels; diverging (percentile) scale for 'better/worse' readings. */
export function sequential(domain: [number, number]) {
  return scaleQuantize<string>().domain(domain).range(LAUT.slice(1));
}

/** Equal-count classes for descriptive maps: skewed indicators (density, night lights)
 *  would otherwise put almost every district in the palest class. */
export function sequentialQuantiles(values: number[]) {
  // Quintiles: with 27 districts, finer classes would hold only two or three each.
  return scaleQuantile<string>().domain(values).range([LAUT[1], LAUT[3], LAUT[5], LAUT[7], LAUT[10]]);
}

/** Percentile (0 = worst, 100 = best) -> diverging Mogah–Laut. */
export function percentileColor(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "#e4ddcf";
  const i = Math.max(0, Math.min(MOGAH_LAUT.length - 1, Math.round((pct / 100) * (MOGAH_LAUT.length - 1))));
  return MOGAH_LAUT[i];
}

/** Text colour that stays legible on a given fill. */
export function inkOn(hex: string): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return "var(--granite)";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.5 ? "#1e2422" : "#f3ede1";
}
