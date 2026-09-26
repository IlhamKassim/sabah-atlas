"use client";

import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { useEffect, useRef, useState } from "react";

import type { ProjectedDistrict } from "@/lib/geo";

interface Props {
  geo: { width: number; height: number; districts: ProjectedDistrict[]; context: string; contextLabels: { name: string; x: number; y: number }[] };
  fillOf: (id: string) => string;
  labelOf: (id: string) => { value: string; sub: string; flag: string | null } | null;
  hatched: (id: string) => boolean;
  dimmed: (id: string) => boolean;
  selected: string | null;
  hover: string | null;
  onHover: (id: string | null) => void;
  onSelect: (slug: string) => void;
  ariaLabel: string;
}

/** Pan-and-zoom SVG map of Sabah's districts over neighbouring land. Paths are projected on the server. */
export function ExplorerMap({ geo, fillOf, labelOf, hatched, dimmed, selected, hover, onHover, onSelect, ariaLabel }: Props) {
  const { width: W, height: H } = geo;
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [k, setK] = useState(1);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const svg = select(svgRef.current!);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 10])
      .translateExtent([[-W * 0.4, -H * 0.4], [W * 1.4, H * 1.4]])
      .on("zoom", (e) => {
        gRef.current?.setAttribute("transform", e.transform.toString());
        // Round so labels and stroke widths re-render only on meaningful zoom steps.
        setK(Math.round(e.transform.k * 4) / 4);
      });
    svg.call(z).on("dblclick.zoom", null);
    zRef.current = z;
    return () => void svg.on(".zoom", null);
  }, [W, H]);

  // Fly to the selected district (leaving room for the panel on the right), or back out.
  useEffect(() => {
    const z = zRef.current;
    if (!z || !svgRef.current) return;
    const d = geo.districts.find((x) => x.id === selected);
    const svg = select(svgRef.current);
    if (!d) {
      svg.transition().duration(650).call(z.transform, zoomIdentity);
      return;
    }
    const [[x0, y0], [x1, y1]] = d.bounds;
    const scale = Math.min(3.2, 0.32 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    const wide = svgRef.current.clientWidth > 900;
    const t = zoomIdentity.translate(W * (wide ? 0.4 : 0.5), H * (wide ? 0.5 : 0.66)).scale(Math.max(1.2, scale)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    svg.transition().duration(800).call(z.transform, t);
  }, [selected, geo.districts, W, H]);

  const zoomBy = (f: number) => zRef.current && select(svgRef.current!).transition().duration(250).call(zRef.current.scaleBy, f);
  const reset = () => zRef.current && select(svgRef.current!).transition().duration(500).call(zRef.current.transform, zoomIdentity);

  const hovered = geo.districts.find((d) => d.id === hover);
  const tip = hovered ? labelOf(hovered.id) : null;
  const showLabels = k >= 1.75;
  const sw = (n: number) => n / k;

  return (
    <div
      className="absolute inset-0"
      onMouseLeave={() => setPointer(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      {/* The drawing area stops short of the overlays; zoomed content still runs under them. */}
      <div className="absolute inset-x-2 bottom-28 top-11 sm:bottom-24">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={ariaLabel}
        className="h-full w-full cursor-grab touch-none overflow-visible active:cursor-grabbing"
      >
        <defs>
          <pattern id="map-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke="#16241f" strokeOpacity="0.45" strokeWidth="1.4" />
          </pattern>
          {/* Fine dot grain over the land, like a printed map. */}
          <pattern id="map-grain" width={4 / k} height={4 / k} patternUnits="userSpaceOnUse">
            <circle cx={1 / k} cy={1 / k} r={0.55 / k} fill="#000" fillOpacity="0.16" />
          </pattern>
          <filter id="map-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g ref={gRef}>
          <path d={geo.context} fill="var(--nodata)" fillOpacity={0.55} stroke="var(--nodata)" strokeWidth={0.6} />
          {geo.contextLabels.map((l) => (
            <text key={l.name} x={l.x} y={l.y} textAnchor="middle" fontSize={11 / Math.sqrt(k)} className="pointer-events-none select-none font-mono uppercase" fill="var(--faint)" letterSpacing="0.14em">
              {l.name}
            </text>
          ))}
          {/* Soft coastal glow under Sabah. */}
          <g filter="url(#map-glow)" opacity={0.35} aria-hidden>
            {geo.districts.map((d) => <path key={`glow-${d.id}`} d={d.d} fill="var(--laut)" />)}
          </g>
          {geo.districts.map((d) => {
            const on = selected === d.id;
            return (
              <g key={d.id} opacity={dimmed(d.id) ? 0.22 : 1} className="transition-opacity">
                <path
                  d={d.d}
                  fill={fillOf(d.id)}
                  stroke="var(--bg)"
                  strokeWidth={sw(0.9)}
                  strokeLinejoin="round"
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.name}${labelOf(d.id) ? `: ${labelOf(d.id)!.value}` : ""}`}
                  aria-pressed={on}
                  className="cursor-pointer outline-none transition-[fill] duration-500"
                  onMouseEnter={() => onHover(d.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(d.id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onSelect(d.slug)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(d.slug);
                    }
                  }}
                />
                <path d={d.d} fill="url(#map-grain)" pointerEvents="none" />
                {hatched(d.id) && <path d={d.d} fill="url(#map-hatch)" pointerEvents="none" />}
              </g>
            );
          })}
          {/* Outlines for hover and selection drawn last so they sit above neighbours. */}
          {[hover, selected].filter((id, i, a) => id && a.indexOf(id) === i).map((id) => {
            const d = geo.districts.find((x) => x.id === id);
            return d ? (
              <path key={`o-${id}`} d={d.d} fill="none" stroke={id === selected ? "var(--kunyit)" : "var(--ink)"} strokeWidth={sw(id === selected ? 2.4 : 1.6)} strokeLinejoin="round" pointerEvents="none" />
            ) : null;
          })}
          {geo.districts.map((d) =>
            showLabels || d.id === selected ? (
              <text
                key={`l-${d.id}`}
                x={d.cx}
                y={d.cy}
                textAnchor="middle"
                dy="0.35em"
                fontSize={Math.max(4, 12 / k)}
                className="pointer-events-none select-none font-mono uppercase"
                fill="#fff"
                stroke="rgba(6,14,12,0.75)"
                strokeWidth={2.6 / k}
                paintOrder="stroke"
                letterSpacing="0.06em"
              >
                {d.name}
              </text>
            ) : null,
          )}
        </g>
      </svg>
      </div>

      {hovered && tip && pointer && (
        <div
          className="pointer-events-none absolute z-20 min-w-44 rounded-md border border-line bg-night/95 px-3 py-2 text-on-night shadow-xl"
          style={{ left: pointer.x + 14, top: pointer.y + 14 }}
        >
          <p className="font-display text-sm font-semibold">{hovered.name}</p>
          <p className="font-mono text-xs text-kunyit">{tip.value}</p>
          <p className="font-mono text-[0.65rem] text-on-night/65">{tip.sub}</p>
        </div>
      )}

      <div className="absolute right-3 top-3 z-10 flex flex-col overflow-hidden rounded-md border border-line bg-panel/90 backdrop-blur" role="group" aria-label="Zoom">
        <button type="button" onClick={() => zoomBy(1.6)} className="grid h-8 w-8 place-items-center text-muted hover:bg-panel-2 hover:text-ink" aria-label="Zoom in">+</button>
        <button type="button" onClick={() => zoomBy(1 / 1.6)} className="grid h-8 w-8 place-items-center border-y border-line text-muted hover:bg-panel-2 hover:text-ink" aria-label="Zoom out">−</button>
        <button type="button" onClick={reset} className="grid h-8 w-8 place-items-center text-muted hover:bg-panel-2 hover:text-ink" aria-label="Reset view">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5" /></svg>
        </button>
      </div>
    </div>
  );
}
