"use client";

import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import { useTransition } from "react";

export function DistrictPicker({ options }: { options: { slug: string; name: string; division: string }[] }) {
  const [pending, start] = useTransition();
  const [ids, setIds] = useQueryState("ids", parseAsArrayOf(parseAsString).withDefault([]).withOptions({ shallow: false, startTransition: start }));
  const toggle = (slug: string) => {
    if (ids.includes(slug)) setIds(ids.filter((i) => i !== slug));
    else if (ids.length < 4) setIds([...ids, slug]);
  };
  const divisions = Array.from(new Set(options.map((o) => o.division)));
  return (
    <div className={pending ? "opacity-70" : ""}>
      <p className="kicker text-muted">Choose up to four districts ({ids.length}/4)</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-5">
        {divisions.map((dv) => (
          <div key={dv}>
            <p className="mb-1 font-mono text-[0.62rem] uppercase tracking-wide text-muted">{dv}</p>
            <div className="flex flex-wrap gap-1">
              {options.filter((o) => o.division === dv).map((o) => {
                const on = ids.includes(o.slug);
                return (
                  <button key={o.slug} type="button" aria-pressed={on} onClick={() => toggle(o.slug)}
                    disabled={!on && ids.length >= 4}
                    className={`border px-1.5 py-0.5 text-xs disabled:opacity-40 ${on ? "border-ink bg-ink text-bg" : "border-line hover:border-ink"}`}>
                    {o.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
