import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="no-print mt-16 bg-malam text-pasir/80">
      <div className="mogah-rule--full" aria-hidden />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-serif text-lg font-semibold text-pasir">Atlas Ekonomi Sabah</p>
          <p className="mt-2 max-w-xs text-pasir/70">
            Every number has a source and a year. Every modelled number has an uncertainty range. If the atlas
            cannot back a claim, it does not make it.
          </p>
        </div>
        <div className="font-mono text-xs leading-6">
          <p className="mb-1 uppercase tracking-wider text-kunyit">Atlas</p>
          <Link className="block hover:text-kunyit" href="/explore">Explore the map</Link>
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
