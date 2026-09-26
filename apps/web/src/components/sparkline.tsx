import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";

import type { Obs } from "@/lib/api";

export function Sparkline({ series, width = 96, height = 24 }: { series: Obs[]; width?: number; height?: number }) {
  if (series.length < 2) return <span className="font-mono text-[0.6rem] text-faint">single year</span>;
  const xs = series.map((d) => d.period);
  const ys = series.map((d) => d.value);
  const x = scaleLinear().domain([Math.min(...xs), Math.max(...xs)]).range([2, width - 2]);
  const y = scaleLinear().domain([Math.min(...ys), Math.max(...ys)]).range([height - 3, 3]);
  const p = line<Obs>().x((d) => x(d.period)).y((d) => y(d.value));
  const last = series[series.length - 1];
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={p(series) ?? ""} fill="none" stroke="var(--ink)" strokeWidth={1.2} />
      {series.map((d) => (
        <circle key={d.period} cx={x(d.period)} cy={y(d.value)} r={d === last ? 2.2 : 1.2}
          fill={d.quality_flag?.includes("boundary") ? "var(--mogah)" : "var(--ink)"} />
      ))}
    </svg>
  );
}
