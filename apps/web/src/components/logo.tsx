/** SabahKu mark: Kinabalu's jagged summit above the sea, under a rising sun. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--panel-2)" />
      <circle cx="22.5" cy="10" r="3.4" fill="var(--senja)" />
      <path d="M4 22 L10 12.5 L12.2 15 L14.4 9.5 L16.6 13.8 L18.6 11.8 L22 17 L28 22 Z" fill="var(--ink)" />
      <path d="M4 25.2 q3-2 6 0 t6 0 t6 0 t6 0" fill="none" stroke="var(--laut)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      Sabah<span className="text-laut">Ku</span>
    </span>
  );
}
