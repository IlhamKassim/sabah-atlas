import "server-only";

import { api, type Indicator, type Obs, type Source } from "./api";
import { JALUR_GROUPS, type JalurCell } from "./jalur";

export async function catalog() {
  const meta = await api.meta();
  const indicators = Object.fromEntries(meta.indicators.map((i) => [i.code, i])) as Record<string, Indicator>;
  const sources = Object.fromEntries(meta.sources.map((s) => [s.id, s])) as Record<string, Source>;
  return { meta, indicators, sources };
}

export function latest(series: Obs[] | undefined): Obs | undefined {
  return series?.length ? series[series.length - 1] : undefined;
}

/** Latest-period jalur cells from a profile's indicator series. */
export function jalurCells(indicators: Record<string, Obs[]>, catalogue: Record<string, Indicator>): Record<string, JalurCell> {
  const out: Record<string, JalurCell> = {};
  for (const g of JALUR_GROUPS) {
    for (const code of g.codes) {
      const o = latest(indicators[code]);
      out[code] = {
        code,
        pct: o?.pct_sabah ?? null,
        value: o?.value ?? null,
        period: o?.period ?? null,
        neutral: catalogue[code]?.direction === "neutral",
        flagged: !!o?.quality_flag?.includes("boundary_break"),
      };
    }
  }
  return out;
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
