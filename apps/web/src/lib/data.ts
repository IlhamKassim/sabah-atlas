import "server-only";

import { api, type Indicator, type Source } from "./api";
import { JALUR_GROUPS, type JalurCell } from "./jalur";

export { jalurCells, latest } from "./jalur";

export async function catalog() {
  const meta = await api.meta();
  const indicators = Object.fromEntries(meta.indicators.map((i) => [i.code, i])) as Record<string, Indicator>;
  const sources = Object.fromEntries(meta.sources.map((s) => [s.id, s])) as Record<string, Source>;
  return { meta, indicators, sources };
}

/** Jalur cells for every Sabah district at once (from per-indicator calls). */
export async function allJalur(catalogue: Record<string, Indicator>) {
  const codes = JALUR_GROUPS.flatMap((g) => g.codes);
  const results = await Promise.all(codes.map((c) => api.indicator(c)));
  const byDistrict: Record<string, Record<string, JalurCell>> = {};
  results.forEach((r, i) => {
    const code = codes[i];
    for (const v of r.values) {
      (byDistrict[v.district_id] ??= {})[code] = {
        code,
        pct: v.pct_sabah,
        value: v.value,
        period: r.period,
        neutral: catalogue[code]?.direction === "neutral",
        flagged: !!v.quality_flag?.includes("boundary_break"),
      };
    }
  });
  return byDistrict;
}
