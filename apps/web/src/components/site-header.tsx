import Link from "next/link";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/compare", label: "Compare" },
  { href: "/forecasts", label: "Forecasts" },
  { href: "/analyst", label: "Analyst" },
  { href: "/methodology", label: "Methodology" },
  { href: "/data", label: "Data" },
];

export function SiteHeader() {
  return (
    <header className="no-print sticky top-0 z-40 border-b border-black/40 bg-malam text-pasir">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/" className="group flex items-baseline gap-2">
          <JalurMark />
          <span className="font-serif text-[1.05rem] font-semibold tracking-tight">Atlas Ekonomi Sabah</span>
        </Link>
        <nav aria-label="Main" className="-mr-2 flex items-center overflow-x-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap px-2 py-1 font-mono text-[0.72rem] uppercase tracking-wider text-pasir/80 hover:text-kunyit"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="mogah-rule--full" aria-hidden />
    </header>
  );
}

/** A tiny five-band jalur used as the wordmark: one band per division. */
function JalurMark() {
  const c = ["#1f6f78", "#2e5b3c", "#a34a2b", "#7a5c2e", "#2f5f7a"];
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden className="translate-y-[1px]">
      {c.map((fill, i) => (
        <rect key={fill} x={i * 4.4} y={0} width={3.6} height={12} fill={fill} />
      ))}
    </svg>
  );
}
