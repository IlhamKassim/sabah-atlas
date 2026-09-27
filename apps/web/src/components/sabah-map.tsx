"use client";

import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { GlowLayer } from "@/components/after-dark/glow-layer";
import { NightImageLayer } from "@/components/after-dark/night-image";
import type { ProjectedDistrict } from "@/lib/geo";
import type { NightImagery } from "@/lib/lights";
import { NIGHT_FILL_OPACITY, NIGHT_FILL_OPACITY_PICTURE } from "@/lib/scales";

export interface MapDatum {
  fill: string;
  label?: string;       // tooltip first line (value)
  sub?: string;         // tooltip second line (rank, flags)
  hatched?: boolean;    // modelled / not comparable
}

/**
 * Sabah's districts in the atlas style, for every page that shows a map: neighbouring land for
 * context, a sea panel, rounded outlines, and the same hover card as the main map. Paths are
 * projected on the server. Options: `zoomTo` frames one district; `zoomable` adds pan and zoom;
 * `glow` (total light per district) draws it at night.
 */
export function SabahMap({
  width, height, districts, data, context, highlight, dim, labels = false, interactive = true, href = "/district/{slug}", hrefFor,
  zoomTo, zoomable = false, glow, imagery, year, framed = true, ariaLabel, className = "",
}: {
  width: number;
  height: number;
  districts: ProjectedDistrict[];
  data: Record<string, MapDatum>;
  /** Neighbouring land (Sarawak, Labuan) from projectSabahInContext, drawn under Sabah. */
  context?: { path: string; labels?: { name: string; x: number; y: number }[] };
  highlight?: string[];
  dim?: string[];
  labels?: boolean;
  interactive?: boolean;
  /** Where clicking a district goes: "{slug}" is replaced; defaults to its profile. */
  href?: string;
  /** Per-district exceptions to `href`, by slug. */
  hrefFor?: Record<string, string>;
  /** Frame the map on this district (by id), keeping its neighbours around it. */
  zoomTo?: string;
  zoomable?: boolean;
  glow?: Record<string, number> | null;
  /** With `glow`: NASA's picture of that year, drawn instead of the glow when available. */
  imagery?: NightImagery | null;
  year?: number;
  framed?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const router = useRouter();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hover, setHover] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number; w: number } | null>(null);
  const [k, setK] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const hovered = districts.find((d) => d.id === hover);
  const hi = new Set(highlight ?? []);
  const dm = new Set(dim ?? []);
  const night = !!glow;
  const go = (slug: string) => router.push(hrefFor?.[slug] ?? href.replace("{slug}", slug));

  // A district's frame: its bounding box grown to show the neighbours, at the map's aspect ratio.
  let viewBox = `0 0 ${width} ${height}`;
  const focus = zoomTo ? districts.find((d) => d.id === zoomTo) : undefined;
  if (focus) {
    const [[x0, y0], [x1, y1]] = focus.bounds;
    const w = Math.max((x1 - x0) * 2.4, width * 0.28), h = Math.max((y1 - y0) * 2.4, height * 0.28);
    const s = Math.max(w / width, h / height);
    const vw = width * s, vh = height * s;
    viewBox = `${(x0 + x1) / 2 - vw / 2} ${(y0 + y1) / 2 - vh / 2} ${vw} ${vh}`;
  }
  const unit = width / 1000;

  useEffect(() => {
    if (!zoomable) return;
    const svg = select(svgRef.current!);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([[-width * 0.3, -height * 0.3], [width * 1.3, height * 1.3]])
      .on("zoom", (e) => {
        gRef.current?.setAttribute("transform", e.transform.toString());
        setK(Math.round(e.transform.k * 4) / 4);
      });
    svg.call(z).on("dblclick.zoom", null);
    zRef.current = z;
    return () => void svg.on(".zoom", null);
  }, [zoomable, width, height]);
  const zoomBy = (f: number) => zRef.current && select(svgRef.current!).transition().duration(250).call(zRef.current.scaleBy, f);
  const reset = () => zRef.current && select(svgRef.current!).transition().duration(400).call(zRef.current.transform, zoomIdentity);

  return (
    <div
      className={`relative overflow-hidden ${framed ? `rounded-lg border border-line ${night ? "bg-[#05090b]" : "bg-sea"}` : ""} ${className}`}
      onMouseLeave={() => setPointer(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPointer({ x: e.clientX - r.left, y: e.clientY - r.top, w: r.width });
      }}
    >
      <svg
        ref={svgRef}
        viewBox={viewBox}
        role="img"
        aria-label={ariaLabel}
        className={`block h-auto w-full ${zoomable ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
      >
        <defs>
          <pattern id={`${uid}-hatch`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#16241f" strokeOpacity="0.45" strokeWidth="1.4" />
          </pattern>
          {framed && !night && (
            <pattern id={`${uid}-sea`} width={9 * unit + 3} height={9 * unit + 3} patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r={0.9} fill="var(--sea-dot)" opacity="0.35" />
            </pattern>
          )}
        </defs>
        {framed && !night && <rect x={-width} y={-height} width={width * 3} height={height * 3} fill={`url(#${uid}-sea)`} />}
        <g ref={gRef}>
          {context && <path d={context.path} fill={night ? "#0a1214" : "var(--nodata)"} fillOpacity={night ? 1 : 0.55} stroke="none" />}
          {context?.labels?.map((l) => (
            <text key={l.name} x={l.x} y={l.y} textAnchor="middle" fontSize={11 * unit + 3} className="pointer-events-none select-none font-mono uppercase" fill="var(--faint)" letterSpacing="0.14em">
              {l.name}
            </text>
          ))}
          {districts.map((d) => {
            const datum = data[d.id];
            return (
              <g key={d.id} opacity={dm.has(d.id) ? 0.3 : 1}>
                <path
                  d={d.d}
                  fill={datum?.fill ?? "var(--nodata)"}
                  fillOpacity={night ? (imagery ? NIGHT_FILL_OPACITY_PICTURE : NIGHT_FILL_OPACITY) : 1}
                  stroke={night ? "#05090b" : "var(--bg)"}
                  strokeWidth={0.9}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  tabIndex={interactive ? 0 : -1}
                  role={interactive ? "link" : undefined}
                  aria-label={interactive ? `${d.name}${datum?.label ? `: ${datum.label}` : ""}` : undefined}
                  className={interactive ? "cursor-pointer outline-none transition-[fill] duration-500" : ""}
                  onMouseEnter={() => setHover(d.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(d.id)}
                  onBlur={() => setHover(null)}
                  onClick={() => interactive && go(d.slug)}
                  onKeyDown={(e) => {
                    if (interactive && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      go(d.slug);
                    }
                  }}
                />
                {datum?.hatched && <path d={d.d} fill={`url(#${uid}-hatch)`} pointerEvents="none" />}
              </g>
            );
          })}
          {glow && imagery && year ? (
            <NightImageLayer uid={`${uid}-n`} imagery={imagery} year={year} land={districts} unit={unit} scale={k} />
          ) : (
            glow && <GlowLayer uid={`${uid}-n`} land={districts} points={districts} total={glow} unit={unit} scale={k} />
          )}
          {[...hi, ...(hover && !hi.has(hover) ? [hover] : [])].map((id) => {
            const d = districts.find((x) => x.id === id);
            return d ? (
              <path key={`o-${id}`} d={d.d} fill="none" stroke={hi.has(id) ? "var(--kunyit)" : "var(--ink)"} strokeWidth={hi.has(id) ? 2.2 : 1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" />
            ) : null;
          })}
          {labels &&
            districts.map((d) => (
              <text
                key={`l-${d.id}`}
                x={d.cx}
                y={d.cy}
                dy="0.35em"
                textAnchor="middle"
                className="pointer-events-none select-none font-mono uppercase"
                fontSize={Math.max(7, width / 95) / k}
                fill="#fff"
                stroke="rgba(6,14,12,0.75)"
                strokeWidth={2.4 / k}
                paintOrder="stroke"
                letterSpacing="0.04em"
              >
                {d.name}
              </text>
            ))}
        </g>
      </svg>

      {hovered && interactive && pointer && (
        <div
          className="pointer-events-none absolute z-20 min-w-40 rounded-md border border-line bg-night/95 px-3 py-2 text-on-night shadow-xl"
          // Flip to the left of the pointer near the right edge, so the card stays inside the frame.
          style={{ left: pointer.x > pointer.w - 200 ? pointer.x - 190 : pointer.x + 14, top: pointer.y + 14 }}
        >
          <p className="font-display text-sm font-semibold">{hovered.name}</p>
          {data[hovered.id]?.label && <p className="font-mono text-xs text-kunyit">{data[hovered.id]!.label}</p>}
          {data[hovered.id]?.sub && <p className="font-mono text-[0.65rem] text-on-night/65">{data[hovered.id]!.sub}</p>}
        </div>
      )}

      {zoomable && (
        <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-md border border-line bg-panel/90 backdrop-blur" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomBy(1.6)} className="grid h-7 w-7 place-items-center text-muted hover:bg-panel-2 hover:text-ink" aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomBy(1 / 1.6)} className="grid h-7 w-7 place-items-center border-y border-line text-muted hover:bg-panel-2 hover:text-ink" aria-label="Zoom out">−</button>
          <button type="button" onClick={reset} className="grid h-7 w-7 place-items-center text-muted hover:bg-panel-2 hover:text-ink" aria-label="Reset view">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
