"use client";

import { scaleLinear } from "d3-scale";
import { area, line } from "d3-shape";
import { useState } from "react";

import type { FanPoint, ForecastSeries } from "@/lib/api";
import { fmtCompact } from "@/lib/format";

import { ChartFrame } from "./chart-frame";

const SCENARIO_LABEL: Record<string, string> = {
  baseline: "Baseline",
  palm_oil_downturn: "Palm-oil downturn",
  oil_gas_downturn: "Oil & gas downturn",
  services_upswing: "Tourism & services upswing",
};

/**
 * Fan chart: official values (solid), nowcast (dotted, band) and projection (dashed, band),
 * visually separated so a modelled number is never mistaken for an official one.
 */
export function FanChart({
  series, format, title, filename, caption,
}: {
  series: ForecastSeries;
  format: string;
  title: string;
  filename: string;
  caption?: React.ReactNode;
}) {
  const scenarios = Object.keys(series.projection);
  const [scenario, setScenario] = useState("baseline");
  const proj = series.projection[scenario] ?? [];
  const W = 560, H = 250, m = { t: 26, r: 16, b: 26, l: 58 };

  const all: number[] = [
    ...series.official.map((d) => d.value),
    ...series.nowcast.flatMap((d) => [d.p10, d.p90]),
    ...Object.values(series.projection).flat().flatMap((d) => [d.p10, d.p90]),
  ];
  const years = [...series.official.map((d) => d.period), ...series.nowcast.map((d) => d.period), ...proj.map((d) => d.period)];
  const x = scaleLinear().domain([Math.min(...years), Math.max(...years)]).range([m.l, W - m.r]);
  const y = scaleLinear().domain([Math.min(...all) * 0.97, Math.max(...all) * 1.02]).nice().range([H - m.b, m.t]);

  const lastOff = series.official[series.official.length - 1];
  const anchor: FanPoint = { period: lastOff.period, p10: lastOff.value, p50: lastOff.value, p90: lastOff.value };
  const nowPts = series.nowcast.length ? [anchor, ...series.nowcast] : [];
  const projAnchor = nowPts.length ? nowPts[nowPts.length - 1] : anchor;
  const projPts = [projAnchor, ...proj];

  const band = area<FanPoint>().x((d) => x(d.period)).y0((d) => y(d.p10)).y1((d) => y(d.p90));
  const mid = line<FanPoint>().x((d) => x(d.period)).y((d) => y(d.p50));
  const off = line<{ period: number; value: number }>().x((d) => x(d.period)).y((d) => y(d.value));

  const segs = [
    { label: "official", from: series.official[0].period, to: lastOff.period },
    ...(series.nowcast.length ? [{ label: "nowcast", from: lastOff.period, to: series.nowcast[series.nowcast.length - 1].period }] : []),
    ...(proj.length ? [{ label: "projection", from: projAnchor.period, to: proj[proj.length - 1].period }] : []),
  ];
  const rows = [
    ...series.official.map((d) => ({ period: d.period, segment: "official", value: d.value, p10: null, p50: null, p90: null })),
    ...series.nowcast.map((d) => ({ segment: "nowcast", value: null, ...d })),
    ...proj.map((d) => ({ segment: `projection:${scenario}`, value: null, ...d })),
  ];

  const toggle = (
    <>
      {scenarios.length > 1 && (
        <div role="radiogroup" aria-label="Scenario" className="no-print mb-2 flex flex-wrap gap-1">
          {scenarios.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={scenario === s}
              onClick={() => setScenario(s)}
              className={`border px-1.5 py-0.5 text-[0.7rem] ${scenario === s ? "border-laut bg-laut text-bg" : "border-line text-muted hover:border-laut"}`}
            >
              {SCENARIO_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div>
      <ChartFrame title={title} filename={`${filename}-${scenario}`} rows={rows} caption={caption} controls={toggle}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: official values, nowcast and projection with 80% intervals`}>
          {y.ticks(5).map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={0.8} />
              <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted)" className="font-mono">
                {fmtCompact(t, format)}
              </text>
            </g>
          ))}
          {years.filter((v, i, a) => a.indexOf(v) === i).map((t) => (
            <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize={9.5} fill="var(--muted)" className="font-mono">
              {t % 2 === 0 || years.length < 10 ? t : ""}
            </text>
          ))}
          {segs.slice(1).map((s) => (
            <line key={s.label} x1={x(s.from)} x2={x(s.from)} y1={m.t - 8} y2={H - m.b} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="2 3" />
          ))}
          {segs.map((s) => (
            <text key={`t-${s.label}`} x={(x(s.from) + x(s.to)) / 2} y={m.t - 12} textAnchor="middle" fontSize={9} className="font-mono" fill="var(--muted)" letterSpacing="0.06em">
              {s.label.toUpperCase()}
            </text>
          ))}
          {nowPts.length > 0 && <path d={band(nowPts) ?? ""} fill="var(--karang)" fillOpacity={0.32} />}
          {proj.length > 0 && <path d={band(projPts) ?? ""} fill="var(--karang)" fillOpacity={0.22} />}
          {proj.length > 0 && <path d={band(projPts) ?? ""} fill="url(#fanhatch)" />}
          <defs>
            <pattern id="fanhatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--laut)" strokeOpacity="0.18" strokeWidth="1.2" />
            </pattern>
          </defs>
          <path d={off(series.official) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={2} />
          {series.official.map((d) => <circle key={d.period} cx={x(d.period)} cy={y(d.value)} r={2.6} fill="var(--ink)" />)}
          {nowPts.length > 0 && <path d={mid(nowPts) ?? ""} fill="none" stroke="var(--laut)" strokeWidth={1.8} strokeDasharray="1.5 3" strokeLinecap="round" />}
          {proj.length > 0 && <path d={mid(projPts) ?? ""} fill="none" stroke="var(--laut)" strokeWidth={1.8} strokeDasharray="6 4" />}
          {proj.length > 0 && (
            <text x={x(proj[proj.length - 1].period) - 2} y={y(proj[proj.length - 1].p50) - 6} textAnchor="end" fontSize={10} className="font-mono" fill="var(--laut)">
              {fmtCompact(proj[proj.length - 1].p50, format)}
            </text>
          )}
        </svg>
      </ChartFrame>
    </div>
  );
}
