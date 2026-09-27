"use client";

import Link from "next/link";

import { HomeStar } from "@/components/home-star";
import { explainFlag, fmt, ordinal } from "@/lib/format";

import { DivisionTag, type ExplorerData, type ExplorerDistrict, type Value } from "./explorer";

/** Floating card for the selected district, like an inset on a paper map. */
export function DistrictPanel({
  district: d, ind, periods, byPeriod, year, color, formats, onClose,
}: {
  district: ExplorerDistrict;
  ind: ExplorerData["indicator"];
  periods: number[];
  byPeriod: Record<number, Value[]>;
  year: number;
  color: string;
  formats: ExplorerData["headlineFormats"];
  onClose: () => void;
}) {
  const series = periods.map((p) => ({ p, v: byPeriod[p]?.find((x) => x.id === d.id) }));
  const cur = series.find((s) => s.p === year)?.v;
  const vals = series.map((s) => s.v?.value).filter((x): x is number => x != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);

  return (
    <div className="absolute inset-x-3 top-12 z-10 overflow-hidden sm:inset-x-auto sm:right-14 sm:top-3 sm:w-[330px] rounded-lg border border-line bg-panel/95 shadow-2xl backdrop-blur" role="dialog" aria-label={`${d.name} summary`}>
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-wider text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-laut" aria-hidden />
          {d.division ? <DivisionTag division={d.division} /> : "Sabah"}
        </span>
        <span className="flex items-center gap-1">
        {d.kind === "district" && <HomeStar slug={d.slug} name={d.name} compact />}
        <button type="button" onClick={onClose} className="grid h-6 w-6 place-items-center rounded text-muted hover:bg-panel-2 hover:text-ink" aria-label="Close">×</button>
        </span>
      </div>
      <div className="px-3 pb-3 pt-2">
        <h2 className="font-display text-xl font-bold leading-tight sm:text-2xl">{d.name}</h2>
        {d.cluster && <p className="text-[0.72rem] text-muted">{d.cluster}</p>}

        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[0.62rem] uppercase tracking-wider text-faint">{ind.short || ind.label} · {year}</p>
            <p className="font-mono text-2xl tabular">{cur ? fmt(cur.value, ind.format) : "—"}</p>
            {cur?.rank && <p className="text-[0.72rem] text-muted">{ordinal(cur.rank)} of {cur.n} in Sabah</p>}
          </div>
          {vals.length > 1 && (
            <div className="flex h-12 items-end gap-[2px]" aria-label={`${ind.label} by year`}>
              {series.map(({ p, v }) => (
                <span
                  key={p}
                  title={`${p}: ${v ? fmt(v.value, ind.format) : "no data"}`}
                  className="w-2 rounded-t-[1px]"
                  style={{ height: v && hi > lo ? `${20 + ((v.value - lo) / (hi - lo)) * 80}%` : "20%", background: p === year ? color : "var(--line)" }}
                />
              ))}
            </div>
          )}
        </div>
        {cur?.flag && <p className="mt-1 font-mono text-[0.62rem] text-mogah">⚑ {explainFlag(cur.flag)}</p>}

        <dl className="mt-3 hidden grid-cols-3 gap-2 border-t border-line pt-2.5 sm:grid">
          {Object.entries(formats).map(([code, f]) => {
            const h = d.headline[code];
            return (
              <div key={code} className="min-w-0">
                <dt className="truncate font-mono text-[0.56rem] uppercase tracking-wider text-faint">{f.label}</dt>
                <dd className="font-mono text-[0.82rem] tabular">
                  {h ? (code === "population" ? `${fmt(h.value, "number1")}k` : fmt(h.value, f.format)) : "—"}
                </dd>
                {h && <dd className="font-mono text-[0.56rem] text-faint">{h.period}</dd>}
              </div>
            );
          })}
        </dl>

        {d.note && <p className="mt-2 hidden text-[0.68rem] sm:block leading-snug text-muted">{d.note}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Link href={`/district/${d.slug}`} className="rounded-md bg-laut px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-wider text-bg hover:opacity-90">Full profile →</Link>
          {d.kind === "district" && <Link href={`/district/${d.slug}/brief`} className="rounded-md border border-line px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-wider text-muted hover:border-laut hover:text-laut">Brief</Link>}
          <Link href={`/compare?ids=${d.slug}`} className="rounded-md border border-line px-2.5 py-1 font-mono text-[0.68rem] uppercase tracking-wider text-muted hover:border-laut hover:text-laut">Compare</Link>
        </div>
      </div>
    </div>
  );
}
