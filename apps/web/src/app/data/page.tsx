import type { Metadata } from "next";

import { AboutTabs } from "@/components/about-tabs";
import { JsonLd } from "@/components/json-ld";
import { Container, SectionTitle } from "@/components/ui";
import { publicApiUrl } from "@/lib/api";
import { catalog } from "@/lib/data";
import { atlasDataset } from "@/lib/structured-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Data & API",
  description: "Download SabahKu's versioned, checksummed data releases for Sabah's districts under CC BY 4.0, or query the open read API. No key needed.",
  alternates: { canonical: "/data" },
};

const DESCRIBE: Record<string, string> = {
  "observations.csv": "Every value: district, indicator, year, value, source, flags, Sabah rank & percentiles",
  "observations.parquet": "Same as observations.csv, typed columnar format",
  "districts.csv": "Canonical district registry: ids, divisions, lineage, area, centroids",
  "districts.geojson": "District boundaries (2020, simplified) for all 159 mapped districts",
  "indicators.csv": "Indicator catalogue: labels, units, direction, definitions",
  "sources.csv": "Source datasets with vintages, checksums and licences",
  "gdp_sector.csv": "District GDP by sector, 2015–2020 (RM mil, 2015 prices)",
  "typology.csv": "Cluster, principal components and features for every district",
  "scorecard.csv": "Scorecard verdicts with peer medians and trends (Sabah)",
  "shift_share.csv": "Shift-share totals by window and benchmark",
  "forecasts.csv": "Nowcasts and projections with p10 / p50 / p90",
  "model_cards.json": "Model cards: methods, metrics, limitations",
  "errata.yaml": "Source values excluded, with reasons",
  "CITATION.cff": "Machine-readable citation",
  "README.md": "Release notes",
  "manifest.json": "File list with SHA-256 checksums",
};

function size(b: number) {
  return b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
}

export default async function DataPage() {
  const { meta } = await catalog();
  const rel = meta.release;
  const base = rel ? `/data/releases/${rel.version}` : "";
  const year = rel?.version.slice(0, 4) ?? "2026";

  return (
    <Container className="py-8">
      <JsonLd data={atlasDataset(rel)} />
      <AboutTabs />
      <p className="kicker">Data</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Download everything</h1>
      <div className="mogah-rule mt-3" aria-hidden />
      <p className="mt-4 max-w-3xl text-muted">
        Versioned, checksummed data releases under CC BY 4.0 (source datasets keep their own licences), an open read API, and the code that rebuilds it all.
      </p>

      {rel && (
        <section className="mt-8">
          <SectionTitle kicker={`Release ${rel.version}`} title="Current data release">
            Content hash <code className="font-mono text-xs">{rel.content_hash.slice(0, 16)}</code>. A new release is cut whenever DOSM publishes a new vintage; old releases stay available so citations remain reproducible.
          </SectionTitle>
          <a href={`/data/releases/atlas-ekonomi-sabah-${rel.version}.zip`} className="inline-block bg-ink px-4 py-2 font-mono text-sm uppercase tracking-wider text-bg hover:bg-laut">
            Download all (zip)
          </a>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase text-muted"><th className="py-1">File</th><th>Contents</th><th className="text-right">Rows</th><th className="text-right">Size</th><th className="pl-4">SHA-256</th></tr></thead>
              <tbody>
                {rel.manifest.files.map((f) => (
                  <tr key={f.file} className="border-b border-line/70 align-top">
                    <td className="py-1.5 pr-3"><a className="font-mono text-xs text-laut underline" href={`${base}/${f.file}`} download>{f.file}</a></td>
                    <td className="pr-3 text-xs text-muted">{DESCRIBE[f.file] ?? ""}</td>
                    <td className="text-right font-mono text-xs">{f.rows?.toLocaleString() ?? ""}</td>
                    <td className="text-right font-mono text-xs">{size(f.bytes)}</td>
                    <td className="pl-4 font-mono text-[0.62rem] text-muted" title={f.sha256}>{f.sha256.slice(0, 12)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div>
          <SectionTitle kicker="API" title="Open read API" />
          <p className="text-sm text-muted">JSON over HTTPS, versioned under <code className="font-mono">/v1</code>, cached with ETags keyed to the data release. No key needed for read endpoints.</p>
          <ul className="mt-3 space-y-1 font-mono text-xs">
            {[
              ["/v1/districts", "All districts with headline indicators"],
              ["/v1/districts/{id}", "Full profile: series, scorecard, peers, forecasts, sources"],
              ["/v1/indicators/{code}?period=", "One indicator for all districts"],
              ["/v1/compare?ids=a,b,c", "Aligned series for up to four districts"],
              ["/v1/forecast/{id}?indicator=", "Fan-chart series with backtest error"],
              ["/v1/export/{id}.csv", "Tidy CSV for a district"],
              ["/v1/model-cards", "All model cards"],
              ["/v1/data/releases", "Current release manifest"],
            ].map(([p, d]) => <li key={p}><span className="text-laut">GET {p}</span> <span className="font-sans text-muted">— {d}</span></li>)}
          </ul>
          <p className="mt-3 text-sm">Interactive docs: <a className="text-laut underline" href={`${publicApiUrl}/docs`}>{publicApiUrl}/docs</a> · OpenAPI: <a className="text-laut underline" href={`${publicApiUrl}/openapi.json`}>openapi.json</a></p>
          <pre className="mt-3 overflow-x-auto bg-night p-3 font-mono text-xs text-on-night">{`import pandas as pd
url = "${publicApiUrl}/v1/indicators/income_median?scope=national"
df = pd.json_normalize(pd.read_json(url, typ="series")["values"])`}</pre>
        </div>
        <div>
          <SectionTitle kicker="Cite" title="How to cite" />
          <p className="font-mono text-[0.62rem] uppercase text-muted">APA</p>
          <p className="mt-1 text-sm">Kassim, I. ({year}). <em>SabahKu: district economic data release {rel?.version}</em> [Data set]. https://github.com/IlhamKassim/sabah-atlas</p>
          <p className="mt-4 font-mono text-[0.62rem] uppercase text-muted">BibTeX</p>
          <pre className="mt-1 overflow-x-auto bg-panel p-3 font-mono text-xs">{`@misc{sabahku${year},
  author = {Kassim, Ilham},
  title  = {SabahKu: district economic data release ${rel?.version ?? ""}},
  year   = {${year}},
  url    = {https://github.com/IlhamKassim/sabah-atlas},
  note   = {CC BY 4.0}
}`}</pre>
          <p className="mt-3 text-sm text-muted">Please also cite the underlying sources, listed in <code className="font-mono">sources.csv</code>: Department of Statistics Malaysia (OpenDOSM), CC BY 4.0; geoBoundaries (Runfola et al., 2020), CC BY 3.0. Each page also has a “Cite this view” button that includes the permalink.</p>
          <SectionTitle kicker="Licences" title="Licences" />
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Data releases: CC BY 4.0, where source licences allow.</li>
            <li>DOSM / OpenDOSM data: CC BY 4.0.</li>
            <li>District boundaries: geoBoundaries, CC BY 3.0.</li>
            <li>Code: MIT.</li>
          </ul>
        </div>
      </section>
    </Container>
  );
}
