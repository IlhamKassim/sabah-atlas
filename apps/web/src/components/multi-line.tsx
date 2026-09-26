import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";

import type { Obs } from "@/lib/api";
import { fmtCompact } from "@/lib/format";

import { ChartFrame } from "./chart-frame";

export const COMPARE_COLORS = ["var(--laut)", "var(--mogah)", "var(--kunyit)", "var(--hutan)"];

/** Small-multiple trajectory chart for up to four districts. */
export function MultiLine({ title, series, names, format, filename }: {
  title: string;
  series: Record<string, Obs[]>;
  names: Record<string, string>;
  format: string;
  filename: string;
}) {
  const ids = Object.keys(series).filter((k) => series[k]?.length);
  const all = ids.flatMap((k) => series[k]);
  if (!all.length) return null;
  const W = 300, H = 160, m = { t: 10, r: 10, b: 20, l: 52 };
  const xs = all.map((d) => d.period), ys = all.map((d) => d.value);
  const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([m.l, W - m.r]);
  const y = scaleLinear().domain([Math.min(...ys), Math.max(...ys)]).nice().range([H - m.b, m.t]);
  const p = line<Obs>().x((d) => x(d.period)).y((d) => y(d.value));
  const years = Array.from(new Set(xs)).sort();
  return (
    <ChartFrame title={title} filename={filename}
      rows={ids.flatMap((k) => series[k].map((d) => ({ district: names[k], period: d.period, value: d.value, source_id: d.source_id, quality_flag: d.quality_flag })))}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={0.7} />
            <text x={m.l - 4} y={y(t)} dy="0.32em" textAnchor="end" fontSize={8.5} className="font-mono" fill="var(--muted)">{fmtCompact(t, format)}</text>
          </g>
        ))}
        {years.map((t, i) => (i % Math.ceil(years.length / 6) === 0 || i === years.length - 1) && (
          <text key={t} x={x(t)} y={H - 5} textAnchor="middle" fontSize={8.5} className="font-mono" fill="var(--muted)">{t}</text>
        ))}
        {ids.map((k, i) => (
          <g key={k}>
            <path d={p(series[k]) ?? ""} fill="none" stroke={COMPARE_COLORS[i]} strokeWidth={1.8} strokeDasharray={i === 1 ? "5 3" : i === 2 ? "1.5 2.5" : i === 3 ? "8 3 2 3" : undefined} />
            {series[k].map((d) => <circle key={d.period} cx={x(d.period)} cy={y(d.value)} r={2} fill={COMPARE_COLORS[i]} />)}
          </g>
        ))}
      </svg>
    </ChartFrame>
  );
}
