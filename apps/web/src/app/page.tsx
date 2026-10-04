import type { Metadata } from "next";

import { Explorer, type ExplorerData } from "@/components/explorer/explorer";
import { api } from "@/lib/api";
import { catalog } from "@/lib/data";
import { projectSabahInContext } from "@/lib/geo";
import { nightImagery } from "@/lib/lights";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const [{ meta, indicators, sources }, districts, geo] = await Promise.all([
    catalog(),
    api.districts("sabah"),
    projectSabahInContext(1000, 820),
  ]);
  const code = typeof sp.indicator === "string" && indicators[sp.indicator]?.periods?.length ? sp.indicator : "income_median";
  const ind = indicators[code];
  const periods = ind.periods ?? [];
  // Every release of the indicator at once, so the timeline can play without round trips.
  // The map's night style (night-lights indicators only) sizes each district's glow by total light.
  const night = ind.category === "lights";
  const [results, ntlTotal, imagery] = await Promise.all([
    Promise.all(periods.map((p) => api.indicator(code, p))),
    night ? Promise.all(periods.map((p) => api.indicator("ntl_radiance_total", p))) : Promise.resolve([]),
    night ? nightImagery(1000, 820, 40) : Promise.resolve(null),
  ]);
  const lights = Object.fromEntries(ntlTotal.map((r) => [r.period, Object.fromEntries(r.values.map((v) => [v.district_id, v.value]))]));
  const src = results.at(-1)?.sources[0] ?? sources[ind.source];

  const data: ExplorerData = {
    indicator: { code, label: ind.label, short: ind.short, unit: ind.unit, format: ind.format, direction: ind.direction, description: ind.description, category: ind.category },
    options: meta.indicators
      .filter((i) => (i.periods?.length ?? 0) > 0)
      .map((i) => ({ code: i.code, label: i.label, category: i.category, periods: i.periods!.length })),
    periods,
    byPeriod: Object.fromEntries(
      results.map((r) => [
        r.period,
        r.values.map((v) => ({
          id: v.district_id, value: v.value, rank: v.rank_sabah, n: v.n_sabah, pct: v.pct_sabah, flag: v.quality_flag, modelled: v.is_modelled,
        })),
      ]),
    ),
    districts: districts.map((d) => ({
      id: d.id, slug: d.slug, name: d.name, division: d.division, kind: d.kind, cluster: d.cluster ?? null, note: d.note,
      headline: d.headline ?? {},
    })),
    headlineFormats: Object.fromEntries(
      ["income_median", "poverty_absolute", "population"].map((c) => [c, { label: indicators[c]?.short ?? c, format: indicators[c]?.format ?? "", unit: indicators[c]?.unit ?? "" }]),
    ),
    source: src ? { publisher: src.publisher, dataset: src.dataset_id, url: src.url, updated: src.last_updated?.slice(0, 10) ?? null } : null,
    release: meta.release?.version ?? null,
    geo,
    lights,
    imagery,
  };

  return <Explorer data={data} />;
}
