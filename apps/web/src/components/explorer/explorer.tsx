"use client";

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, useTransition } from "react";

import { Wordmark } from "@/components/logo";
import { explainFlag, fmt, ordinal } from "@/lib/format";
import { useHomeDistrict } from "@/lib/home-district";
import type { ProjectedDistrict } from "@/lib/geo";
import type { NightImagery } from "@/lib/lights";
import { DIVISION_HEX, DIVISIONS, percentileColor, sequentialQuantiles } from "@/lib/scales";

import { DistrictPanel } from "./district-panel";
import { ExplorerMap } from "./explorer-map";
import { Legend } from "./legend";
import { SeaCanvas } from "./sea-canvas";
import { Timeline } from "./timeline";

export interface Value { id: string; value: number; rank: number | null; n: number | null; pct: number | null; flag: string | null; modelled: boolean }
export interface ExplorerDistrict {
  id: string; slug: string; name: string; division: string | null; kind: string; cluster: string | null; note: string | null;
  headline: Record<string, { value: number; period: number; pct_sabah: number | null }>;
}
export interface ExplorerData {
  indicator: { code: string; label: string; short: string; unit: string; format: string; direction: "up" | "down" | "neutral"; description: string; category: string };
  options: { code: string; label: string; category: string; periods: number }[];
  periods: number[];
  byPeriod: Record<number, Value[]>;
  districts: ExplorerDistrict[];
  headlineFormats: Record<string, { label: string; format: string; unit: string }>;
  source: { publisher: string; dataset: string; url: string; updated: string | null } | null;
  release: string | null;
  geo: { width: number; height: number; districts: ProjectedDistrict[]; context: string; contextLabels: { name: string; x: number; y: number }[] };
  /** Total night-time radiance by year and district, for the map's night style. */
  lights: Record<number, Record<string, number>>;
  /** NASA's yearly pictures of Sabah at night, when the API has them. */
  imagery: NightImagery | null;
}

export const CATEGORY_LABEL: Record<string, string> = {
  welfare: "Welfare", structure: "Economy", labour: "Jobs", access: "Services",
  momentum: "Momentum", demography: "People", lights: "Night lights",
};
const CATEGORY_ORDER = ["welfare", "structure", "labour", "lights", "demography", "access", "momentum"];

export function Explorer({ data }: { data: ExplorerData }) {
  const { indicator: ind, periods, byPeriod, districts, geo } = data;
  const [pending, start] = useTransition();
  const [q, setQ] = useQueryStates(
    { indicator: parseAsString, year: parseAsInteger, d: parseAsString, division: parseAsString },
    { history: "replace" },
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"rank" | "name" | "division">("rank");
  const [hover, setHover] = useState<string | null>(null);
  const mapRef = useRef<HTMLElement>(null);
  const home = useHomeDistrict();

  const latest = periods.at(-1)!;
  const year = q.year && periods.includes(q.year) ? q.year : latest;
  const values = useMemo(() => byPeriod[year] ?? [], [byPeriod, year]);
  const byId = useMemo(() => new Map(values.map((v) => [v.id, v])), [values]);
  const dist = useMemo(() => new Map(districts.map((d) => [d.id, d])), [districts]);
  const selected = districts.find((d) => d.slug === q.d) ?? null;
  const division = q.division && (DIVISIONS as readonly string[]).includes(q.division) ? q.division : null;

  // Descriptive indicators share one set of classes across every year, so change over time shows.
  const seq = useMemo(
    () => sequentialQuantiles(Object.values(byPeriod).flat().map((v) => v.value), ind.category === "lights" ? "lights" : "laut"),
    [byPeriod, ind.category],
  );
  const directional = ind.direction !== "neutral";
  // Night-lights indicators draw the map at night, glowing with each district's total light.
  const night = ind.category === "lights";
  const colorOf = useCallback((v: Value | undefined) => (!v ? "var(--nodata)" : directional ? percentileColor(v.pct) : seq(v.value)), [directional, seq]);

  const setIndicator = (code: string) => void setQ({ indicator: code === "income_median" ? null : code, year: null }, { shallow: false, startTransition: start });
  const select = (slug: string | null) => void setQ({ d: slug });

  const range = useMemo(() => {
    if (!values.length) return null;
    const s = [...values].sort((a, b) => a.value - b.value);
    return { lo: s[0], hi: s[s.length - 1] };
  }, [values]);

  const rows = values
    .map((v) => ({ v, d: dist.get(v.id) }))
    .filter((r): r is { v: Value; d: ExplorerDistrict } => !!r.d)
    .filter(({ d }) => !division || d.division === division)
    .filter(({ d }) => !search || d.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) =>
      sort === "name" ? a.d.name.localeCompare(b.d.name)
        : sort === "division" ? (a.d.division ?? "").localeCompare(b.d.division ?? "") || (a.v.rank ?? 99) - (b.v.rank ?? 99)
          : (a.v.rank ?? 99) - (b.v.rank ?? 99) || b.v.value - a.v.value);

  const cats = CATEGORY_ORDER.filter((c) => data.options.some((o) => o.category === c));
  const inCat = data.options.filter((o) => o.category === ind.category);
  const divCount = (dv: string) => values.filter((v) => dist.get(v.id)?.division === dv).length;
  const onMap = new Set(geo.districts.map((g) => g.id));
  const mapped = values.filter((v) => onMap.has(v.id)).length;

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-49px)] lg:flex-row">
      {/* Sidebar */}
      <aside className="order-2 flex min-h-0 flex-col border-line bg-panel lg:order-1 lg:w-[400px] lg:shrink-0 lg:border-r" aria-label="Indicator and districts">
        <div className="border-b border-line px-4 pb-4 pt-4">
          <div className="flex items-baseline gap-3">
            <p className="font-display text-5xl font-bold leading-none text-laut tabular">27</p>
            <p className="text-[0.78rem] leading-tight text-muted">districts of Sabah mapped<br />every number carries a source</p>
          </div>
          {range && (
            <div className="mt-3 flex items-end justify-between gap-2 border-t border-line pt-3">
              <p className="min-w-0">
                <span className="whitespace-nowrap font-mono text-base text-ink tabular sm:text-lg">{fmt(range.lo.value, ind.format)} → {fmt(range.hi.value, ind.format)}</span>
                <span className="block truncate text-[0.72rem] text-muted">
                  {ind.short || ind.label}, {year}: {dist.get(range.lo.id)?.name} to {dist.get(range.hi.id)?.name}
                </span>
              </p>
              {data.release && <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[0.62rem] text-faint">release {data.release}</span>}
            </div>
          )}
        </div>

        <div className={`space-y-3 border-b border-line px-4 py-4 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Topic">
            {cats.map((c) => {
              const active = ind.category === c;
              const n = data.options.filter((o) => o.category === c).length;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && setIndicator(data.options.find((o) => o.category === c)!.code)}
                  className={`chip ${active ? "chip--on" : ""}`}
                >
                  {CATEGORY_LABEL[c] ?? c} <span className="chip-count">{n}</span>
                </button>
              );
            })}
          </div>
          <label className="block">
            <span className="sr-only">Indicator</span>
            <select className="field w-full" value={ind.code} onChange={(e) => setIndicator(e.target.value)}>
              {inCat.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
            </select>
          </label>
          <p className="text-[0.76rem] leading-snug text-muted">{ind.description}</p>

          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search districts"
              aria-label="Search districts"
              className="field w-full pl-8"
            />
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Division">
            <button type="button" aria-pressed={!division} onClick={() => setQ({ division: null })} className={`chip ${!division ? "chip--on" : ""}`}>
              All <span className="chip-count">{values.length}</span>
            </button>
            {DIVISIONS.map((dv) => (
              <button key={dv} type="button" aria-pressed={division === dv} onClick={() => setQ({ division: division === dv ? null : dv })} className={`chip ${division === dv ? "chip--on" : ""}`}>
                <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: DIVISION_HEX[dv] }} aria-hidden />
                {dv} <span className="chip-count">{divCount(dv)}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-[0.76rem] text-muted">
            <span><span className="text-ink">{rows.length}</span> results</span>
            <label className="flex items-center gap-1.5">
              <span>Sort</span>
              <select className="field py-0.5 text-[0.76rem]" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="rank">{directional ? "Best to worst" : "Highest first"}</option>
                <option value="name">Name A–Z</option>
                <option value="division">Division</option>
              </select>
            </label>
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={`Districts, ${ind.label} ${year}`}>
          {rows.map(({ v, d }) => {
            const on = selected?.id === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => {
                    select(on ? null : d.slug);
                    // On phones the map sits above the list: bring it into view.
                    if (!on && window.innerWidth < 1024) mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  onMouseEnter={() => setHover(d.id)}
                  onMouseLeave={() => setHover(null)}
                  aria-pressed={on}
                  className={`grid w-full grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line px-4 py-2.5 text-left transition-colors hover:bg-panel-2 ${on ? "bg-panel-2 shadow-[inset_3px_0_0_var(--kunyit)]" : ""}`}
                >
                  <span className="font-mono text-[0.72rem] text-faint tabular">{v.rank ?? "–"}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-display text-[0.98rem] font-semibold">{d.name}</span>
                      {home?.slug === d.slug && <span className="text-kunyit" title="Your district">★</span>}
                      {d.division && <DivisionTag division={d.division} />}
                    </span>
                    <span className="block truncate text-[0.7rem] text-muted">
                      {d.cluster ?? ""}
                      {!onMap.has(d.id) && " · not on the 2020 map"}
                      {v.flag && <span className="text-mogah"> · ⚑ {explainFlag(v.flag)}</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 font-mono text-[0.82rem] tabular">
                    {fmt(v.value, ind.format)}
                    <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: colorOf(v) }} aria-hidden />
                  </span>
                </button>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-4 py-6 text-sm text-muted">No district matches “{search}”.</li>}
        </ul>

        <div className="border-t border-line px-4 py-2.5 font-mono text-[0.62rem] leading-relaxed text-faint">
          {data.source && (
            <p>
              {data.source.publisher} · <a className="underline decoration-dotted underline-offset-2 hover:text-laut" href={data.source.url}>{data.source.dataset}</a>
              {data.source.updated && ` · updated ${data.source.updated}`} · unit: {ind.unit}
            </p>
          )}
          <p><Wordmark className="text-[0.7rem] text-muted" /> · DOSM via OpenDOSM (CC BY 4.0) · <Link className="hover:text-laut" href="/methodology">methodology</Link> · <Link className="hover:text-laut" href="/about">about</Link></p>
        </div>
      </aside>

      {/* Map */}
      <section ref={mapRef} className={`relative order-1 h-[64vh] min-h-[420px] overflow-hidden lg:order-2 lg:h-auto lg:flex-1 ${night ? "bg-[#05090b]" : "bg-sea"}`} aria-label="Map">
        {!night && <SeaCanvas />}
        <ExplorerMap
          geo={geo}
          fillOf={(id) => colorOf(byId.get(id))}
          labelOf={(id) => {
            const v = byId.get(id);
            return v ? { value: `${fmt(v.value, ind.format)}${ind.format === "pct" ? "" : ` ${ind.unit}`}`, sub: v.rank ? `${ordinal(v.rank)} of ${v.n} in Sabah · ${year}` : String(year), flag: v.flag } : null;
          }}
          hatched={(id) => !!byId.get(id)?.flag?.includes("boundary_break")}
          dimmed={(id) => !!division && dist.get(id)?.division !== division}
          selected={selected?.id ?? null}
          hover={hover}
          onHover={setHover}
          onSelect={(slug) => select(slug === q.d ? null : slug)}
          ariaLabel={`Map of ${ind.label} by district, ${year}`}
          glow={night ? data.lights[year] ?? null : null}
          imagery={night ? data.imagery : null}
          year={year}
          home={districts.find((d) => d.slug === home?.slug)?.id ?? null}
        />

        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="map-pill"><span className="text-laut">{mapped}</span> on the map</span>
          <span className="map-pill max-w-[60vw] truncate">{ind.label} · {year}</span>
          {!night && (
            <button type="button" onClick={() => setIndicator("ntl_radiance_mean")} className="map-pill pointer-events-auto hover:text-kunyit" title="See Sabah at night: satellite night-time lights, 2012–2025">
              ✦ After dark
            </button>
          )}
        </div>

        {selected && (
          <DistrictPanel
            district={selected}
            ind={ind}
            periods={periods}
            byPeriod={byPeriod}
            year={year}
            color={colorOf(byId.get(selected.id))}
            formats={data.headlineFormats}
            onClose={() => select(null)}
          />
        )}

        <div className="absolute inset-x-3 bottom-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
          <Timeline periods={periods} year={year} byPeriod={byPeriod} onYear={(y) => setQ({ year: y === latest ? null : y })} />
          <Legend directional={directional} direction={ind.direction} seq={seq} format={ind.format} night={night} picture={night && !!data.imagery} />
        </div>
      </section>
    </div>
  );
}

export function DivisionTag({ division }: { division: string }) {
  return (
    <span
      className="shrink-0 rounded-[3px] border px-1 py-px font-mono text-[0.56rem] uppercase tracking-wider"
      style={{ color: DIVISION_HEX[division], borderColor: `color-mix(in oklab, ${DIVISION_HEX[division]} 45%, transparent)` }}
    >
      {division}
    </span>
  );
}
