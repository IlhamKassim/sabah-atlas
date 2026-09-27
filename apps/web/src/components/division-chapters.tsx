"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { ProjectedDistrict } from "@/lib/geo";

import { SabahMap } from "./sabah-map";

export interface Chapter {
  division: string;
  color: string;
  districts: { id: string; slug: string; name: string }[];
  facts: { label: string; value: string; note?: string }[];
  lede: string;
}

/**
 * Scrollytelling: five chapters, one per division. A sticky map highlights the
 * division whose chapter is in view (IntersectionObserver; no scroll listeners).
 */
export function DivisionChapters({ chapters, map }: { chapters: Chapter[]; map: { width: number; height: number; districts: ProjectedDistrict[] } }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const ch = chapters[active];
  const inDiv = new Set(ch.districts.map((d) => d.id));
  const data = Object.fromEntries(
    map.districts.map((d) => [d.id, { fill: inDiv.has(d.id) ? ch.color : "#2a3533", label: d.division ?? "" }]),
  );

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="md:sticky md:top-20 md:h-[calc(100vh-7rem)] md:self-start">
        <div className="flex h-full flex-col justify-center">
          <SabahMap
            width={map.width}
            height={map.height}
            districts={map.districts}
            data={data}
            stroke="var(--night)"
            highlight={[...inDiv]}
            ariaLabel={`Map highlighting the ${ch.division} Division`}
          />
          <p className="mt-2 text-center font-mono text-xs uppercase tracking-widest" style={{ color: ch.color }}>
            {ch.division} Division
          </p>
        </div>
      </div>
      <div>
        {chapters.map((c, i) => (
          <section
            key={c.division}
            ref={(el) => { refs.current[i] = el; }}
            data-index={i}
            className={`flex min-h-[80vh] flex-col justify-center py-10 transition-opacity duration-500 ${i === active ? "opacity-100" : "opacity-40"}`}
            aria-labelledby={`ch-${i}`}
          >
            <p className="font-mono text-xs uppercase tracking-widest text-kunyit">Chapter {i + 1} of 5</p>
            <h3 id={`ch-${i}`} className="mt-1 font-display text-3xl font-semibold text-on-night">{c.division}</h3>
            <div className="mt-2 h-1.5 w-24" style={{ background: c.color }} aria-hidden />
            <p className="mt-4 max-w-md leading-relaxed text-on-night/80">{c.lede}</p>
            <dl className="mt-5 grid max-w-md grid-cols-2 gap-x-6 gap-y-4">
              {c.facts.map((f) => (
                <div key={f.label}>
                  <dt className="font-mono text-[0.66rem] uppercase tracking-wider text-on-night/55">{f.label}</dt>
                  <dd className="mt-0.5 font-mono text-lg text-on-night">{f.value}</dd>
                  {f.note && <dd className="font-mono text-[0.65rem] text-on-night/50">{f.note}</dd>}
                </div>
              ))}
            </dl>
            <p className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {c.districts.map((d) => (
                <Link key={d.id} href={`/district/${d.slug}`} className="text-karang underline decoration-karang/40 underline-offset-2 hover:text-kunyit">
                  {d.name}
                </Link>
              ))}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
