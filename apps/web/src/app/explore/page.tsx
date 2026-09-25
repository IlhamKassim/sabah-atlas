import type { Metadata } from "next";
import Link from "next/link";

import { ChartFrame } from "@/components/chart-frame";
import { CiteButton } from "@/components/cite-button";
import { ExploreControls } from "@/components/explore-controls";
import { MapLegend } from "@/components/map-legend";
import { SabahMap, type MapDatum } from "@/components/sabah-map";
import { Container, SourceNote } from "@/components/ui";
import { api } from "@/lib/api";
import { catalog } from "@/lib/data";
import { explainFlag, fmt, ordinal } from "@/lib/format";
import { projectSabah } from "@/lib/geo";
import { LAUT, percentileColor, sequential } from "@/lib/scales";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore the map" };

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const { meta, indicators, sources } = await catalog();
  const code = typeof sp.indicator === "string" && indicators[sp.indicator] ? sp.indicator : "income_median";
  const year = typeof sp.year === "string" ? Number(sp.year) : undefined;
  const division = typeof sp.division === "string" ? sp.division : null;

  const [res, geo] = await Promise.all([api.indicator(code, year), projectSabah(760, 560)]);
  const ind = res.indicator;
  const values = res.values;
  const onMap = new Map(values.map((v) => [v.district_id, v]));
  const directional = ind.direction !== "neutral";
  const vals = values.map((v) => v.value);
  const seq = sequential([Math.min(...vals), Math.max(...vals)]);

  const data: Record<string, MapDatum> = {};
  for (const d of geo.districts) {
    const v = onMap.get(d.id);
    if (!v) continue;
    data[d.id] = {
      fill: directional ? percentileColor(v.pct_sabah) : seq(v.value),
      label: `${fmt(v.value, ind.format)}${ind.format === "pct" ? "" : ` · ${ind.unit}`}`,
      sub: `${v.rank_sabah ? `${ordinal(v.rank_sabah)} of ${v.n_sabah} in Sabah` : ""}${v.quality_flag ? ` · ⚑ ${explainFlag(v.quality_flag)}` : ""}`,
      hatched: !!v.quality_flag?.includes("boundary_break"),
    };
  }
  const dim = division ? geo.districts.filter((d) => d.division !== division).map((d) => d.id) : [];
  const rows = values
    .filter((v) => !division || v.division === division)
    .sort((a, b) => (a.rank_sabah ?? 99) - (b.rank_sabah ?? 99) || b.value - a.value);
  const options = meta.indicators
    .filter((i) => (i.periods?.length ?? 0) > 0)
    .map((i) => ({ code: i.code, label: i.label, category: i.category }));
  const src = res.sources[0] ?? sources[ind.source];
  const noGeo = values.filter((v) => !geo.districts.some((d) => d.id === v.district_id));

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Explore · {res.period}</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">{ind.label}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{ind.description}</p>
        </div>
        <CiteButton title={`${ind.label}, Sabah districts, ${res.period}`} />
      </div>
      <div className="mogah-rule mt-3" aria-hidden />

      <div className="mt-6 grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
        <aside className="no-print">
          <ExploreControls options={options} periods={res.periods} current={{ indicator: code, period: res.period }} />
          <div className="mt-6">
            <MapLegend
              directional={directional}
              direction={ind.direction}
              min={Math.min(...vals)}
              max={Math.max(...vals)}
              format={ind.format}
              steps={LAUT.slice(1)}
            />
          </div>
        </aside>

        <section aria-label="Map">
          <ChartFrame
            filename={`sabah-${code}-${res.period}`}
            rows={values.map((v) => ({ district_id: v.district_id, district: v.name, indicator: code, period: res.period, value: v.value, rank_sabah: v.rank_sabah, quality_flag: v.quality_flag, source_id: v.source_id }))}
            caption={
              <>
                <SourceNote source={src} period={res.period} />
                {src?.last_updated && <span className="block">Source last updated {src.last_updated.slice(0, 10)} · hatched = boundary change, see table</span>}
              </>
            }
          >
            <SabahMap
              width={geo.width}
              height={geo.height}
              districts={geo.districts}
              data={data}
              dim={dim}
              ariaLabel={`Map of ${ind.label} by district, ${res.period}`}
            />
          </ChartFrame>
          {noGeo.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Not on the map (no 2020 boundary): {noGeo.map((v) => `${v.name} ${fmt(v.value, ind.format)}`).join(", ")}. Membakut was gazetted out of Beaufort and is reported separately from 2024.
            </p>
          )}
        </section>

        <section aria-label="Ranking" className="lg:max-h-[640px] lg:overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="kicker pb-2 text-left text-muted">
              {division ?? "All Sabah"} · {directional ? "best to worst" : "highest to lowest"}
            </caption>
            <thead>
              <tr className="border-b border-granite/60 text-left font-mono text-[0.66rem] uppercase tracking-wide text-muted">
                <th className="py-1 pr-2">#</th>
                <th className="py-1">District</th>
                <th className="py-1 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.district_id} className="border-b border-pasir-3/70 align-top">
                  <td className="py-1.5 pr-2 font-mono text-xs text-muted">{v.rank_sabah ?? "–"}</td>
                  <td className="py-1.5">
                    <Link href={`/district/${v.slug}`} className="hover:text-laut hover:underline">{v.name}</Link>
                    {v.quality_flag && <span className="block font-mono text-[0.62rem] text-mogah">⚑ {explainFlag(v.quality_flag)}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right font-mono tabular">
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 align-middle" style={{ background: data[v.district_id]?.fill ?? (directional ? percentileColor(v.pct_sabah) : seq(v.value)) }} aria-hidden />
                    {fmt(v.value, ind.format)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="source-note mt-2">Unit: {ind.unit}</p>
        </section>
      </div>
    </Container>
  );
}
