"use client";

import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

import { CiteButton } from "@/components/cite-button";
import { DistrictPicker } from "@/components/district-picker";
import { Jalur, JalurLegend } from "@/components/jalur";
import { COMPARE_COLORS, MultiLine } from "@/components/multi-line";
import { SabahMap } from "@/components/sabah-map";
import { Container, SectionTitle } from "@/components/ui";
import type { Analytics, District, Indicator, Obs } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { ProjectedDistrict } from "@/lib/geo";
import { jalurCells } from "@/lib/jalur";
import { getJson, publicApi } from "@/lib/public-api";

const ROWS = ["income_median", "poverty_absolute", "gini", "gdp_per_capita", "gdp_growth", "income_growth", "unemployment_rate", "lfpr",
  "access_piped_water", "access_electricity", "share_agriculture", "share_manufacturing", "share_services", "population", "pop_density"];
const TRAJ = ["income_median", "poverty_absolute", "unemployment_rate", "gdp_real"];
const DASH = ["solid", "dashed", "dotted", "dash-dot"];

interface Comparison { districts: District[]; series: Record<string, Record<string, Obs[]>>; analytics: Record<string, Analytics> }
export interface CompareProps {
  options: { slug: string; name: string; division: string }[];
  geo: { width: number; height: number; districts: ProjectedDistrict[]; context: string };
  ind: Record<string, Indicator>;
}

/** Each district's share of the comparison is its own static file; merge the chosen ones in order. */
async function loadComparison(slugs: string[]): Promise<Comparison> {
  const parts = await Promise.all(slugs.map((s) => getJson<Comparison>(publicApi.compare(s)).catch(() => null)));
  const out: Comparison = { districts: [], series: {}, analytics: {} };
  for (const p of parts) {
    if (!p) continue;
    out.districts.push(...p.districts);
    Object.assign(out.analytics, p.analytics);
    for (const [code, byD] of Object.entries(p.series)) Object.assign((out.series[code] ??= {}), byD);
  }
  return out;
}

// The static HTML has nothing chosen; ?ids= applies once the page loads.
export function CompareView(props: CompareProps) {
  return (
    <Suspense fallback={<CompareBody {...props} raw={[]} cmp={null} pending={false} />}>
      <CompareFromUrl {...props} />
    </Suspense>
  );
}

function CompareFromUrl(props: CompareProps) {
  const [ids] = useQueryState("ids", parseAsArrayOf(parseAsString).withDefault([]));
  const raw = ids.filter(Boolean).slice(0, 4);
  const key = raw.join(",");
  const [loaded, setLoaded] = useState<{ key: string; cmp: Comparison } | null>(null);
  useEffect(() => {
    if (!key) return;
    let stale = false;
    loadComparison(key.split(",")).then((cmp) => !stale && setLoaded({ key, cmp }));
    return () => {
      stale = true;
    };
  }, [key]);
  const cmp = key ? loaded?.cmp ?? null : null;
  return <CompareBody {...props} raw={raw} cmp={cmp} pending={!!key && loaded?.key !== key} />;
}

function CompareBody({ options, geo, ind, raw, cmp, pending }: CompareProps & { raw: string[]; cmp: Comparison | null; pending: boolean }) {
  return (
    <Container className={`py-8 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kicker">Compare</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Districts side by side</h1>
        </div>
        {cmp && <CiteButton title={`Comparison of ${cmp.districts.map((d) => d.name).join(", ")}`} />}
      </div>
      <div className="mogah-rule mt-3" aria-hidden />
      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="no-print"><DistrictPicker options={options} /></div>
        {/* Selected districts in their chart colours; clicking a district adds or removes it. */}
        <SabahMap
          width={geo.width}
          height={geo.height}
          districts={geo.districts}
          context={{ path: geo.context }}
          data={Object.fromEntries(geo.districts.map((g) => {
            const i = raw.indexOf(g.slug);
            return [g.id, { fill: i >= 0 ? COMPARE_COLORS[i] : "var(--nodata)", label: i >= 0 ? "Click to remove" : raw.length < 4 ? "Click to add" : "Four already chosen" }];
          }))}
          hrefFor={Object.fromEntries(geo.districts.map((g) => {
            const next = raw.includes(g.slug) ? raw.filter((x) => x !== g.slug) : raw.length < 4 ? [...raw, g.slug] : raw;
            return [g.slug, next.length ? `/compare?ids=${next.join(",")}` : "/compare"];
          }))}
          className="hidden md:block"
          ariaLabel={`Map of the districts being compared${raw.length ? `: ${raw.join(", ")}` : ""}`}
        />
      </div>

      {!raw.length || (cmp && !cmp.districts.length) ? (
        <p className="mt-10 text-muted">Pick districts above, or try <Link className="underline" href="/compare?ids=pitas,kota-marudu,kudat,tongod">the four lowest-income districts</Link>.</p>
      ) : !cmp ? (
        <p className="mt-10 text-muted" aria-busy>Loading…</p>
      ) : (
        <>
          <section className="mt-10">
            <SectionTitle kicker="Signatures" title="Jalur, side by side" />
            <JalurLegend />
            <div className="mt-4 space-y-3">
              {cmp.districts.map((d, i) => {
                const series = Object.fromEntries(Object.entries(cmp.series).map(([code, byD]) => [code, byD[d.id] ?? []])) as Record<string, Obs[]>;
                return (
                  <div key={d.id} className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-3">
                    <Link href={`/district/${d.slug}`} className="flex items-center gap-2 text-sm hover:underline">
                      <span className="inline-block h-2.5 w-5" style={{ background: COMPARE_COLORS[i] }} aria-hidden />
                      {d.name}
                    </Link>
                    <Jalur cells={jalurCells(series, ind)} height={22} cellWidth={26} gap={2} title={`${d.name} signature`} />
                  </div>
                );
              })}
            </div>
            <p className="source-note mt-2">Line styles in charts below: {cmp.districts.map((d, i) => `${d.name} = ${DASH[i]}`).join(" · ")}</p>
          </section>

          <section className="mt-10">
            <SectionTitle kicker="Indicators" title="Latest values" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase tracking-wide text-muted">
                    <th className="py-1.5">Indicator</th>
                    {cmp.districts.map((d) => <th key={d.id} className="py-1.5 text-right">{d.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.filter((c) => cmp.series[c] && ind[c]).map((code) => {
                    const i = ind[code];
                    const lat = cmp.districts.map((d) => {
                      const s = cmp.series[code][d.id] ?? [];
                      return s[s.length - 1];
                    });
                    const vals = lat.map((o) => o?.value).filter((v): v is number => v != null);
                    const best = i.direction === "up" ? Math.max(...vals) : i.direction === "down" ? Math.min(...vals) : null;
                    return (
                      <tr key={code} className="border-b border-line/70">
                        <td className="py-1.5 pr-3">{i.label}<span className="block text-[0.65rem] text-muted">{i.unit}</span></td>
                        {lat.map((o, k) => (
                          <td key={k} className={`py-1.5 text-right font-mono tabular ${o && best != null && o.value === best && vals.length > 1 ? "font-semibold text-laut" : ""}`}>
                            {o ? fmt(o.value, i.format) : "—"}
                            <span className="block text-[0.6rem] font-normal text-muted">{o ? `${o.period}${o.rank_sabah ? ` · #${o.rank_sabah}` : ""}` : ""}{o?.quality_flag?.includes("boundary") ? " ⚑" : ""}</span>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="source-note mt-2">Bold teal marks the best value among the selection where higher or lower is clearly better. # = rank in Sabah. ⚑ = boundary change.</p>
            </div>
          </section>

          <section className="mt-10">
            <SectionTitle kicker="Trajectories" title="How they moved" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {TRAJ.filter((c) => cmp.series[c] && ind[c]).map((code) => (
                <MultiLine
                  key={code}
                  title={ind[code].label}
                  series={cmp.series[code]}
                  names={Object.fromEntries(cmp.districts.map((d) => [d.id, d.name]))}
                  format={ind[code].format}
                  filename={`compare-${code}-${raw.join("-")}`}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </Container>
  );
}
