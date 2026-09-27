"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark, Wordmark } from "./logo";

export function SiteFooter() {
  // The map is a full-screen app; its sidebar carries the credits instead.
  if (usePathname() === "/") return null;
  return (
    <footer className="no-print mt-16 border-t border-line bg-panel text-muted">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="flex items-center gap-2 text-lg text-ink"><LogoMark size={24} /><Wordmark /></p>
          <p className="mt-3 max-w-xs">
            Every number has a source and a year. Every modelled number has an uncertainty range. If SabahKu
            cannot back a claim, it does not make it.
          </p>
        </div>
        <div className="font-mono text-xs leading-6">
          <p className="mb-1 uppercase tracking-wider text-kunyit">Atlas</p>
          <Link className="block hover:text-kunyit" href="/">Explore the map</Link>
          <Link className="block hover:text-kunyit" href="/overview">Sabah at a glance</Link>
          <Link className="block hover:text-kunyit" href="/methodology">Methodology &amp; model cards</Link>
          <Link className="block hover:text-kunyit" href="/data">Data releases &amp; API</Link>
          <Link className="block hover:text-kunyit" href="/about">About, credits &amp; corrections</Link>
        </div>
        <div className="font-mono text-xs leading-6">
          <p className="mb-1 uppercase tracking-wider text-kunyit">Sources &amp; licence</p>
          <p>Official statistics: DOSM via OpenDOSM (CC BY 4.0)</p>
          <p>Boundaries: geoBoundaries (CC BY 3.0)</p>
          <p>Data releases: CC BY 4.0 · Code: MIT</p>
          <a className="hover:text-kunyit" href="https://github.com/IlhamKassim/sabah-atlas">github.com/IlhamKassim/sabah-atlas</a>
        </div>
      </div>
    </footer>
  );
}
