import type { ReactNode } from "react";

import type { Source } from "@/lib/api";
import { explainFlag } from "@/lib/format";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto max-w-7xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function SectionTitle({ kicker, title, children, id }: { kicker?: string; title: string; children?: ReactNode; id?: string }) {
  return (
    <div className="mb-5" id={id}>
      {kicker && <p className="kicker mb-1">{kicker}</p>}
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">{title}</h2>
      <div className="mogah-rule mt-2" aria-hidden />
      {children && <div className="mt-3 max-w-3xl text-[0.95rem] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

/** Source line under a number: publisher, dataset, vintage. */
export function SourceNote({ source, period, flag, className = "" }: { source?: Source | null; period?: number | string; flag?: string | null; className?: string }) {
  if (!source && !period) return null;
  return (
    <p className={`source-note ${className}`}>
      {source ? (
        <>
          {source.publisher} · <a href={source.url} className="underline decoration-dotted underline-offset-2 hover:text-laut">{source.dataset_id}</a>
        </>
      ) : (
        "Derived"
      )}
      {period ? ` · ${period}` : ""}
      {flag ? <span className="block text-mogah">⚑ {explainFlag(flag)}</span> : null}
    </p>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "model" }) {
  const tones = {
    neutral: "bg-panel text-ink border-line",
    good: "bg-laut/10 text-laut border-laut/30",
    bad: "bg-mogah/10 text-mogah border-mogah/30",
    warn: "bg-kunyit/15 text-kunyit-ink border-kunyit/40",
    model: "bg-night/5 text-ink border-ink/20 border-dashed",
  } as const;
  return <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[0.66rem] uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-muted">
      <span className="rungus-dots" aria-hidden>
        <span /> <span /> <span /> <span />
      </span>
      {label}…
    </div>
  );
}

export function ApiDown() {
  return (
    <div className="dastar mx-auto my-16 max-w-xl p-6 text-sm">
      <p className="kicker">Data service unavailable</p>
      <p className="mt-2">The atlas API did not respond. The data release can still be downloaded from the <a className="underline" href="/data">data page</a>.</p>
    </div>
  );
}
