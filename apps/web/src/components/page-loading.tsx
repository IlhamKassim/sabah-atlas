import Link from "next/link";

import { LoadingMap } from "@/components/loading-map";
import { Container, Loading } from "@/components/ui";

function Lines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`h-3 rounded-sm bg-panel-2 ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

function Stats() {
  return (
    <div className="grid gap-4 sm:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="dastar space-y-4 p-4">
          <div className="h-3 w-2/3 bg-panel-2" />
          <div className="h-8 w-1/2 bg-panel-2" />
          <div className="h-2 w-3/4 bg-panel-2" />
        </div>
      ))}
    </div>
  );
}

/** The shared root layout keeps the site header and navigation above these fallbacks. */
export function MapLoading() {
  return (
    <div className="flex flex-col lg:h-[calc(100dvh-49px)] lg:flex-row" aria-busy="true">
      <aside className="order-2 border-line bg-panel lg:order-1 lg:w-[400px] lg:shrink-0 lg:border-r">
        <div className="border-b border-line p-4">
          <p className="kicker">Explore Sabah</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">27 districts, one atlas</h1>
          <Loading label="Loading district data" />
          <Lines rows={3} />
        </div>
        <div className="space-y-6 p-4" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => <Lines key={i} rows={2} />)}
        </div>
      </aside>
      <div className="relative order-1 h-[64vh] min-h-[420px] bg-sea lg:order-2 lg:h-auto lg:flex-1">
        <LoadingMap />
        <p className="map-pill absolute bottom-4 left-4">District map · data loading</p>
      </div>
    </div>
  );
}

type Layout = "profile" | "compare" | "forecast" | "overview" | "article" | "analyst";

export function PageLoading({ kicker, title, layout }: { kicker: string; title: string; layout: Layout }) {
  const map = ["profile", "compare", "overview"].includes(layout);
  const article = layout === "article";
  return (
    <Container className={`py-8 ${article ? "max-w-4xl" : ""}`}>
      <div aria-busy="true">
        {["Methodology", "Data"].includes(kicker) && (
          <nav aria-label="About SabahKu" className="mb-6 flex gap-4 border-b border-line pb-2 font-mono text-xs text-muted">
            <Link href="/about">About</Link>
            <Link href="/methodology" aria-current={kicker === "Methodology" ? "page" : undefined} className={kicker === "Methodology" ? "text-kunyit" : ""}>Methodology</Link>
            <Link href="/data" aria-current={kicker === "Data" ? "page" : undefined} className={kicker === "Data" ? "text-kunyit" : ""}>Data &amp; API</Link>
          </nav>
        )}
        <p className="kicker">{kicker}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mogah-rule mt-3" aria-hidden />
        <Loading label={`Loading ${kicker.toLowerCase()}`} />
        {article ? (
          <div className="dastar space-y-8 p-6"><Lines rows={3} /><Lines rows={6} /><Lines rows={5} /></div>
        ) : (
          <>
            {layout !== "analyst" && <Stats />}
            <div className={`mt-8 grid gap-6 ${layout === "compare" ? "md:grid-cols-[minmax(0,1fr)_320px]" : "md:grid-cols-2"}`}>
              <div className="dastar space-y-7 p-6">
                <Lines rows={layout === "analyst" ? 3 : 6} />
                <div className="h-40 bg-panel-2" aria-hidden />
                <Lines rows={3} />
              </div>
              {map ? (
                <div className="min-h-80 bg-sea"><LoadingMap /></div>
              ) : (
                <div className="dastar space-y-6 p-6"><Lines rows={8} /><Lines rows={4} /></div>
              )}
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
