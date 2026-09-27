"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { useHomeDistrict } from "@/lib/home-district";

import { LogoMark, Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const NAV = [
  { href: "/", label: "Map" },
  { href: "/overview", label: "At a glance" },
  { href: "/compare", label: "Compare" },
  { href: "/forecasts", label: "Forecasts" },
  { href: "/analyst", label: "Analyst" },
  { href: "/about", label: "About", also: ["/methodology", "/data"] },
];

export function SiteHeader() {
  const path = usePathname();
  const home = useHomeDistrict();
  const [open, setOpen] = useState(false);
  const active = (n: (typeof NAV)[number]) =>
    n.href === "/" ? path === "/" : [n.href, ...(n.also ?? [])].some((h) => path.startsWith(h));

  // Close the phone menu on navigation and on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const homeLink = home && (
    <Link
      href={`/?d=${home.slug}`}
      onClick={() => setOpen(false)}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-kunyit/40 px-2 py-1 font-mono text-[0.66rem] uppercase tracking-wider text-kunyit hover:bg-kunyit/10"
      title="Your district"
    >
      ★ {home.name}
    </Link>
  );

  return (
    <header className="no-print sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex h-12 items-center justify-between gap-4 px-3 sm:px-4">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SabahKu home" onClick={() => setOpen(false)}>
          <LogoMark />
          <Wordmark className="text-[1.15rem]" />
          <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.14em] text-faint xl:inline">Economic atlas · 27 districts</span>
        </Link>

        <div className="-mr-1 hidden items-center gap-1 md:flex">
          <nav aria-label="Main" className="flex items-center">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n) ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2 py-1 font-mono text-[0.7rem] uppercase tracking-wider hover:text-kunyit ${active(n) ? "bg-panel-2 text-ink" : "text-muted"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          {homeLink && <span className="ml-1">{homeLink}</span>}
          <ThemeToggle />
        </div>

        <div className="-mr-1 flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="phone-menu"
            className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="phone-menu" aria-label="Main" className="border-t border-line bg-bg px-3 pb-4 pt-2 md:hidden">
          <ul>
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={active(n) ? "page" : undefined}
                  className={`block rounded-md px-3 py-2.5 font-display text-base ${active(n) ? "bg-panel-2 text-ink" : "text-muted"}`}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          {homeLink && <div className="mt-2 px-3">{homeLink}</div>}
        </nav>
      )}
    </header>
  );
}
