"use client";

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { DIVISIONS } from "@/lib/scales";

interface Opt { code: string; label: string; category: string }

const CATEGORY_LABEL: Record<string, string> = {
  welfare: "Welfare", structure: "Economic structure", labour: "Labour market", access: "Access to services",
  momentum: "Momentum", demography: "Population",
};

export function ExploreControls({ options, periods, current }: { options: Opt[]; periods: number[]; current: { indicator: string; period: number } }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useQueryStates(
    { indicator: parseAsString, year: parseAsInteger, division: parseAsString },
    { shallow: false, startTransition: start },
  );
  const cats = Array.from(new Set(options.map((o) => o.category)));

  return (
    <div className={`space-y-5 ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
      <label className="block">
        <span className="kicker text-muted">Indicator</span>
        <select
          className="mt-1 w-full border border-pasir-3 bg-white/60 px-2 py-1.5 text-sm"
          value={q.indicator ?? current.indicator}
          onChange={(e) => setQ({ indicator: e.target.value, year: null })}
        >
          {cats.map((c) => (
            <optgroup key={c} label={CATEGORY_LABEL[c] ?? c}>
              {options.filter((o) => o.category === c).map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="kicker text-muted">Year</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {periods.map((p) => {
            const active = (q.year ?? current.period) === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => setQ({ year: p })}
                className={`border px-2 py-0.5 font-mono text-xs ${active ? "border-laut bg-laut text-pasir" : "border-pasir-3 text-granite hover:border-laut"}`}
              >
                {p}
              </button>
            );
          })}
        </div>
        {periods.length > 1 && (
          <input
            type="range"
            aria-label="Year slider"
            className="mt-3 w-full accent-[#0f6b6e]"
            min={0}
            max={periods.length - 1}
            value={Math.max(0, periods.indexOf(q.year ?? current.period))}
            onChange={(e) => setQ({ year: periods[Number(e.target.value)] })}
          />
        )}
      </fieldset>

      <fieldset>
        <legend className="kicker text-muted">Division</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {[null, ...DIVISIONS].map((d) => {
            const active = (q.division ?? null) === d;
            return (
              <button
                key={d ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => setQ({ division: d })}
                className={`border px-2 py-0.5 text-xs ${active ? "border-granite bg-granite text-pasir" : "border-pasir-3 hover:border-granite"}`}
              >
                {d ?? "All Sabah"}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
