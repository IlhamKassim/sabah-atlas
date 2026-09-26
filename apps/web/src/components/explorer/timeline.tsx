"use client";

import { useEffect, useRef, useState } from "react";

import type { Value } from "./explorer";

/** Year scrubber with play: steps through every release of the indicator. */
export function Timeline({ periods, year, byPeriod, onYear }: { periods: number[]; year: number; byPeriod: Record<number, Value[]>; onYear: (y: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const yearRef = useRef(year);
  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const i = periods.indexOf(yearRef.current);
      if (i >= periods.length - 1) {
        setPlaying(false);
        return;
      }
      onYear(periods[i + 1]);
    }, periods.length > 6 ? 900 : 1400);
    return () => clearInterval(id);
  }, [playing, periods, onYear]);

  const play = () => {
    if (playing) return setPlaying(false);
    if (year === periods.at(-1)) onYear(periods[0]);
    setPlaying(true);
  };

  // Bar height: the Sabah median for that year, so the strip doubles as a trend line.
  const med = periods.map((p) => {
    const v = (byPeriod[p] ?? []).map((x) => x.value).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : 0;
  });
  const lo = Math.min(...med), hi = Math.max(...med);
  const single = periods.length < 2;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-panel/90 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={play}
        disabled={single}
        aria-label={playing ? "Pause" : "Play through the years"}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-laut/60 text-laut hover:bg-laut hover:text-bg disabled:border-line disabled:text-faint disabled:hover:bg-transparent"
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><rect x="2" y="1" width="3" height="10" fill="currentColor" /><rect x="7" y="1" width="3" height="10" fill="currentColor" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden><path d="M2.5 1 11 6l-8.5 5Z" fill="currentColor" /></svg>
        )}
      </button>
      <p className="w-[4.2rem] shrink-0 font-display text-3xl font-bold leading-none text-laut tabular" aria-live="polite">{year}</p>
      <div className="flex h-10 min-w-0 flex-1 items-end gap-[3px]" role="group" aria-label="Year">
        {periods.map((p, i) => {
          const on = p === year;
          const h = hi > lo ? 25 + ((med[i] - lo) / (hi - lo)) * 75 : 60;
          return (
            <button
              key={p}
              type="button"
              onClick={() => { setPlaying(false); onYear(p); }}
              aria-pressed={on}
              aria-label={String(p)}
              title={String(p)}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className={`w-full max-w-10 rounded-t-[2px] transition-colors ${on ? "bg-laut" : "bg-line group-hover:bg-muted"}`} style={{ height: `${h * 0.72}%` }} />
              <span className={`font-mono text-[0.58rem] leading-none ${on ? "text-ink" : "text-faint"}`}>{periods.length > 8 ? `’${String(p).slice(2)}` : p}</span>
            </button>
          );
        })}
      </div>
      <p className="hidden w-24 shrink-0 text-right font-mono text-[0.62rem] leading-tight text-muted md:block">
        {single ? "one release so far" : `${periods.length} releases`}
        <br />
        <span className="text-faint">bars: Sabah median</span>
      </p>
    </div>
  );
}
