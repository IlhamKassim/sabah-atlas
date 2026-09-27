"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
  { href: "/data", label: "Data & API" },
];

/** About, Methodology and Data share one "About" menu item; these tabs move between them. */
export function AboutTabs() {
  const path = usePathname();
  return (
    <nav aria-label="About SabahKu" className="no-print mb-6 flex gap-1 border-b border-line">
      {TABS.map((t) => {
        const on = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 font-mono text-[0.7rem] uppercase tracking-wider ${on ? "border-kunyit text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
