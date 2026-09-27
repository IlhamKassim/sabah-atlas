/**
 * SabahKu mark (logo system 2a, "Kinabalu after dark"): Kinabalu's jagged ridge drawn as one line
 * over a baseline, with the dawn sun resting on the summit. `mono` draws it in currentColor.
 */
export const MARK_RIDGE = "M14 173 L63 113 L71 127 L94 72 L106 95 L120 60 L141 100 L151 90 L185 173";

export function LogoMark({ size = 28, mono = false }: { size?: number; mono?: boolean }) {
  const ridge = mono ? "currentColor" : "var(--brand-ridge)";
  const sun = mono ? "currentColor" : "var(--brand-sun)";
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden className="shrink-0">
      {!mono && <circle cx="120" cy="32" r="21" fill="var(--brand-halo)" />}
      <circle cx="120" cy="32" r="12" fill={sun} />
      <path d={MARK_RIDGE} fill="none" stroke={ridge} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 187 H185" stroke={mono ? "currentColor" : "var(--brand-base)"} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = "", mono = false }: { className?: string; mono?: boolean }) {
  return (
    <span className={`font-brand font-bold tracking-[-0.035em] ${className}`}>
      Sabah<span className={mono ? undefined : "text-brand-ku"}>Ku</span>
    </span>
  );
}

/** Stacked lockup (2a): the mark centred above the wordmark, for tall or narrow spaces. */
export function LogoStacked({ size = 72, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex flex-col items-center gap-[0.35em] text-ink ${className}`}>
      <LogoMark size={size} />
      <Wordmark className="leading-none" />
    </span>
  );
}
