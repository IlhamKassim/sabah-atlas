"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { ForecastSeries } from "@/lib/api";
import { fmt, signed } from "@/lib/format";

import { ChartFrame } from "./chart-frame";
import { SabahMap } from "./sabah-map";
import type { ProjectedDistrict } from "@/lib/geo";
import { MOGAH_LAUT } from "@/lib/scales";

interface Row { id: string; slug: string; name: string; division: string; gdp?: ForecastSeries; income?: ForecastSeries }

const SCEN = [
  ["baseline", "Baseline"],
  ["palm_oil_downturn", "Palm-oil downturn"],
  ["oil_gas_downturn", "Oil & gas downturn"],
  ["services_upswing", "Tourism & services upswing"],
] as const;

function cagr(a: number, b: number, years: number) {
  return 100 * (Math.pow(b / a, 1 / years) - 1);
}

export function ForecastTable({ rows, map }: { rows: Row[]; map: { width: number; height: number; districts: ProjectedDistrict[]; context: string; contextLabels: { name: string; x: number; y: number }[] } }) {
  const [scenario, setScenario] = useState<string>("baseline");
  const computed = useMemo(() => rows.map((r) => {
    const g = r.gdp;
    const off = g?.official[g.official.length - 1];
    const now = g?.nowcast[g.nowcast.length - 1];
    const proj = g?.projection[scenario]?.[g.projection[scenario].length - 1];
    const inc = r.income?.projection.baseline?.[r.income.projection.baseline.length - 1];
    const incOff = r.income?.official[r.income.official.length - 1];
    return {
      ...r,
      off, now, proj, inc, incOff,
      nowGrowth: off && now ? cagr(off.value, now.p50, now.period - off.period) : null,
      projGrowth: now && proj ? cagr(now.p50, proj.p50, proj.period - now.period) : null,
    };
  }), [rows, scenario]);
  const growths = computed.map((c) => c.projGrowth).filter((v): v is number => v != null);
  const med = growths.sort((a, b) => a - b)[Math.floor(growths.length / 2)] ?? 0;
  const ext = Math.max(...growths.map((g) => Math.abs(g - med)), 0.5);
  const color = (g: number | null) => {
    if (g == null) return "var(--nodata)";
    const t = (g - med) / ext; // -1..1
    const i = Math.round(((t + 1) / 2) * (MOGAH_LAUT.length - 1));
    return MOGAH_LAUT[Math.max(0, Math.min(MOGAH_LAUT.length - 1, i))];
  };
  const data = Object.fromEntries(computed.map((c) => [c.id, {
    fill: color(c.projGrowth),
    label: c.projGrowth != null ? `${signed(c.projGrowth, 1, "%/yr")} real GDP, 2025–2028` : "no projection",
    sub: `${SCEN.find((s) => s[0] === scenario)?.[1]} · modelled`,
    hatched: true,
  }]));

  return (
    <div>
      <div role="radiogroup" aria-label="Scenario" className="no-print mb-4 flex flex-wrap gap-1">
        {SCEN.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={scenario === k} onClick={() => setScenario(k)}
            className={`border px-2 py-1 text-xs ${scenario === k ? "border-laut bg-laut text-bg" : "border-line hover:border-laut"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <ChartFrame
          title="Projected real GDP growth, 2025–2028"
          filename={`projected-gdp-growth-${scenario}`}
          rows={computed.map((c) => ({ district_id: c.id, district: c.name, scenario, gdp_2025_nowcast_p50: c.now?.p50, gdp_2028_p10: c.proj?.p10, gdp_2028_p50: c.proj?.p50, gdp_2028_p90: c.proj?.p90, growth_2025_2028_pct: c.projGrowth }))}
          caption={<>Hatched: every value on this map is modelled. Colour is relative to the median district ({signed(med, 1, "%/yr")}): teal faster, red slower. Scenarios shift Sabah&apos;s sector growth transparently; see methodology.</>}
        >
          <SabahMap width={map.width} height={map.height} districts={map.districts} context={{ path: map.context, labels: map.contextLabels }} data={data} zoomable labels={false} ariaLabel="Map of projected GDP growth by district" />
        </ChartFrame>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase tracking-wide text-muted">
                <th className="py-1.5">District</th>
                <th className="py-1.5 text-right">GDP 2020<br />official</th>
                <th className="py-1.5 text-right">2025<br />nowcast</th>
                <th className="py-1.5 text-right">2028 projection<br />p50 (p10–p90)</th>
                <th className="py-1.5 text-right">Growth<br />25→28</th>
                <th className="py-1.5 text-right">Median income 2027<br />p50 (p10–p90)</th>
              </tr>
            </thead>
            <tbody>
              {computed.map((c) => (
                <tr key={c.id} className="border-b border-line/70">
                  <td className="py-1.5"><Link className="hover:text-laut hover:underline" href={`/district/${c.slug}`}>{c.name}</Link><span className="block text-[0.65rem] text-muted">{c.division}</span></td>
                  <td className="py-1.5 text-right font-mono tabular">{c.off ? fmt(c.off.value, "number0") : "—"}</td>
                  <td className="py-1.5 text-right font-mono tabular text-laut">{c.now ? fmt(c.now.p50, "number0") : "—"}<span className="block text-[0.62rem] text-muted">{c.nowGrowth != null ? signed(c.nowGrowth, 1, "%/yr") : ""}</span></td>
                  <td className="py-1.5 text-right font-mono tabular text-laut">{c.proj ? <>{fmt(c.proj.p50, "number0")}<span className="block text-[0.62rem] text-muted">{fmt(c.proj.p10, "number0")}–{fmt(c.proj.p90, "number0")}</span></> : "—"}</td>
                  <td className="py-1.5 text-right font-mono tabular"><span className="mr-1 inline-block h-2 w-2" style={{ background: color(c.projGrowth) }} />{c.projGrowth != null ? signed(c.projGrowth, 1, "%") : "—"}</td>
                  <td className="py-1.5 text-right font-mono tabular text-laut">{c.inc ? <>{fmt(c.inc.p50, "currency")}<span className="block text-[0.62rem] text-muted">{fmt(c.inc.p10, "currency")}–{fmt(c.inc.p90, "currency")} · 2024: {c.incOff ? fmt(c.incOff.value, "currency") : "—"}</span></> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="source-note mt-2">GDP: RM million at 2015 prices. Official values: DOSM gdp_district_real_supply (to 2020) and hh_income_district (to 2024). Teal figures are modelled.</p>
        </div>
      </div>
    </div>
  );
}
