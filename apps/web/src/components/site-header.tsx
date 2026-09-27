"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useHomeDistrict } from "@/lib/home-district";

import { LogoMark, Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/overview", label: "Overview" },
  { href: "/compare", label: "Compare" },
  { href: "/forecasts", label: "Forecasts" },
  { href: "/analyst", label: "Analyst" },
  { href: "/methodology", label: "Methodology" },
  { href: "/data", label: "Data" },
];

export function SiteHeader() {
  const path = usePathname();
  const home = useHomeDistrict();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-12 items-center justify-between gap-4 px-3 sm:px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SabahKu home">
          <LogoMark />
          <Wordmark className="text-[1.15rem]" />
          <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.14em] text-faint md:inline">Economic atlas · 27 districts</span>
        </Link>
        <div className="-mr-1 flex min-w-0 items-center gap-1">
          <nav aria-label="Main" className="flex items-center overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2 py-1 font-mono text-[0.7rem] uppercase tracking-wider hover:text-kunyit ${active(n.href) ? "bg-panel-2 text-ink" : "text-muted"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          {home && (
            <Link href={`/?d=${home.slug}`} className="ml-1 hidden items-center gap-1 whitespace-nowrap rounded-md border border-kunyit/40 px-2 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-kunyit hover:bg-kunyit/10 sm:inline-flex" title="Your district">
              ★ {home.name}
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
