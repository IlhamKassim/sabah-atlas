// One indicator's slice of the home map's data. The page builds the default indicator at build time;
// the browser builds any other from the static API when the reader picks it.
import type { ExplorerData } from "@/components/explorer/explorer";

import type { Indicator, IndicatorValue, Source } from "./api";

export interface IndicatorResult { indicator: Indicator; period: number; periods: number[]; values: IndicatorValue[]; sources: Source[] }
export type IndicatorView = Pick<ExplorerData, "indicator" | "periods" | "byPeriod" | "source" | "lights">;

export const DEFAULT_INDICATOR = "income_median";

export async function indicatorView(
  code: string,
  fetchIndicator: (code: string, period?: number) => Promise<IndicatorResult>,
  fallbackSource?: Source,
): Promise<IndicatorView> {
  const { indicator: ind, periods } = await fetchIndicator(code);
  // Every release of the indicator at once, so the timeline can play without round trips.
  // The map's night style (night-lights indicators only) sizes each district's glow by total light.
  const night = ind.category === "lights";
  const [results, ntlTotal] = await Promise.all([
    Promise.all(periods.map((p) => fetchIndicator(code, p))),
    night ? Promise.all(periods.map((p) => fetchIndicator("ntl_radiance_total", p))) : Promise.resolve([]),
  ]);
  const src = results.at(-1)?.sources[0] ?? fallbackSource;
  return {
    indicator: { code, label: ind.label, short: ind.short, unit: ind.unit, format: ind.format, direction: ind.direction, description: ind.description, category: ind.category },
    periods,
    byPeriod: Object.fromEntries(
      results.map((r) => [
        r.period,
        r.values.map((v) => ({
          id: v.district_id, value: v.value, rank: v.rank_sabah, n: v.n_sabah, pct: v.pct_sabah, flag: v.quality_flag, modelled: v.is_modelled,
        })),
      ]),
    ),
    source: src ? { publisher: src.publisher, dataset: src.dataset_id, url: src.url, updated: src.last_updated?.slice(0, 10) ?? null } : null,
    lights: Object.fromEntries(ntlTotal.map((r) => [r.period, Object.fromEntries(r.values.map((v) => [v.district_id, v.value]))])),
  };
}
