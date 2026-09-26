import { LAUT, percentileColor } from "./scales";

/** The jalur (woven strip): one band per indicator, grouped like a woven cloth. */
export const JALUR_GROUPS: { key: string; label: string; codes: string[] }[] = [
  { key: "welfare", label: "Welfare", codes: ["income_median", "poverty_absolute", "gini", "gdp_per_capita"] },
  { key: "structure", label: "Structure", codes: ["share_services", "share_agriculture", "share_manufacturing", "pop_density"] },
  { key: "momentum", label: "Momentum", codes: ["income_growth", "gdp_growth", "lfpr", "unemployment_rate"] },
  { key: "access", label: "Access", codes: ["access_piped_water", "access_electricity"] },
  { key: "lights", label: "Lights", codes: ["ntl_radiance_mean", "ntl_lit_share", "ntl_growth"] },
];

export const JALUR_SHORT: Record<string, string> = {
  income_median: "Income",
  poverty_absolute: "Poverty",
  gini: "Gini",
  gdp_per_capita: "GDP/cap",
  share_services: "Services",
  share_agriculture: "Agri",
  share_manufacturing: "Mfg",
  pop_density: "Density",
  income_growth: "Inc. growth",
  gdp_growth: "GDP growth",
  lfpr: "LFPR",
  unemployment_rate: "Jobless",
  access_piped_water: "Water",
  access_electricity: "Power",
  ntl_radiance_mean: "Radiance",
  ntl_lit_share: "Lit area",
  ntl_growth: "Lights growth",
};

export interface JalurCell {
  code: string;
  pct: number | null;
  value: number | null;
  period: number | null;
  neutral: boolean;
  flagged: boolean;
}

/** Colour: directional indicators use the diverging scale (teal = better, whatever the
 *  direction); structural (neutral) ones use the sequential scale (darker = higher). */
export function jalurColor(cell: JalurCell): string {
  if (cell.pct == null) return "#e4ddcf";
  if (cell.neutral) {
    const i = Math.round((cell.pct / 100) * (LAUT.length - 2)) + 1;
    return LAUT[Math.min(LAUT.length - 1, i)];
  }
  return percentileColor(cell.pct);
}
