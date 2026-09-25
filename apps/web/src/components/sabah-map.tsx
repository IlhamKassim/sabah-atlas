"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ProjectedDistrict } from "@/lib/geo";

export interface MapDatum {
  fill: string;
  label?: string;       // tooltip first line (value)
  sub?: string;         // tooltip second line (rank, flags)
  hatched?: boolean;    // modelled / not comparable
}

/**
 * Interactive SVG choropleth of Sabah's districts. Paths are projected on the server;
 * this component adds hover, keyboard focus and click-through to district profiles.
 */
export function SabahMap({
  width, height, districts, data, highlight, dim, labels = false, stroke = "#f3ede1",
  interactive = true, ariaLabel, className = "",
}: {
  width: number;
  height: number;
  districts: ProjectedDistrict[];
  data: Record<string, MapDatum>;
  highlight?: string[];
  dim?: string[];
  labels?: boolean;
  stroke?: string;
  interactive?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const hovered = districts.find((d) => d.id === hover);
  const hi = new Set(highlight ?? []);
  const dm = new Set(dim ?? []);

  return (
    <div className={`relative ${className}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#1e2422" strokeOpacity="0.35" strokeWidth="1.4" />
          </pattern>
        </defs>
        {districts.map((d) => {
          const datum = data[d.id];
          const isHover = hover === d.id;
          return (
            <g key={d.id} opacity={dm.has(d.id) ? 0.28 : 1}>
              <path
                d={d.d}
                fill={datum?.fill ?? "#e4ddcf"}
                stroke={isHover || hi.has(d.id) ? "#1e2422" : stroke}
                strokeWidth={isHover || hi.has(d.id) ? 1.6 : 0.7}
                strokeLinejoin="round"
                tabIndex={interactive ? 0 : -1}
                role={interactive ? "link" : undefined}
                aria-label={interactive ? `${d.name}${datum?.label ? `: ${datum.label}` : ""}` : undefined}
                className={interactive ? "cursor-pointer outline-none transition-[stroke-width]" : ""}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.id)}
                onBlur={() => setHover(null)}
                onClick={() => interactive && router.push(`/district/${d.slug}`)}
                onKeyDown={(e) => {
                  if (interactive && (e.key === "Enter" || e.key === " ")) router.push(`/district/${d.slug}`);
                }}
              />
              {datum?.hatched && <path d={d.d} fill="url(#hatch)" pointerEvents="none" />}
            </g>
          );
        })}
        {labels &&
          districts.map((d) => (
            <text
              key={`l-${d.id}`}
              x={d.cx}
              y={d.cy}
              textAnchor="middle"
              className="pointer-events-none select-none font-mono"
              fontSize={Math.max(8, width / 95)}
              fill="#1e2422"
              stroke="#f3ede1"
              strokeWidth={2.5}
              paintOrder="stroke"
            >
              {d.name}
            </text>
          ))}
      </svg>
      {hovered && interactive && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-[calc(100%+10px)] border border-granite bg-malam px-2.5 py-1.5 text-pasir shadow-lg"
          style={{ left: `${(hovered.cx / width) * 100}%`, top: `${(hovered.cy / height) * 100}%` }}
        >
          <p className="font-serif text-sm font-semibold">{hovered.name}</p>
          {data[hovered.id]?.label && <p className="font-mono text-xs text-kunyit">{data[hovered.id]!.label}</p>}
          {data[hovered.id]?.sub && <p className="font-mono text-[0.65rem] text-pasir/70">{data[hovered.id]!.sub}</p>}
        </div>
      )}
    </div>
  );
}
