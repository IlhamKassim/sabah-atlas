import type { Metadata } from "next";
import Link from "next/link";

import { AboutTabs } from "@/components/about-tabs";
import { Container } from "@/components/ui";
import { api } from "@/lib/api";
import { catalog } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Methodology & model cards" };

type Card = Record<string, unknown> & { task: string; title: string; model_version: string; method: string; limitations: string[] };
const num = (v: unknown, d = 1) => (typeof v === "number" ? v.toFixed(d) : "—");
const pct = (v: unknown) => (typeof v === "number" ? `${Math.round(v * 100)}%` : "—");

const TOC = [
  ["principles", "Principles"], ["sources", "Sources & vintages"], ["geography", "Geography & harmonisation"],
  ["indicators", "Indicators"], ["scorecard", "Scorecard rules"], ["shift-share", "Shift-share"],
  ["typology", "Typology & peers"], ["drivers", "Driver analysis"], ["forecast", "Nowcasts & projections"],
  ["analyst", "AI Analyst"], ["errata", "Errata"], ["reproduce", "Reproduce everything"],
];

interface LightsCard {
  available: boolean;
  years?: number[];
  best_beta?: number;
  challenger_beta?: number;
  adopted?: boolean;
  beta_grid?: Record<string, number>;
  median_ape_by_horizon?: Record<string, Record<string, number>>;
}

export default async function MethodologyPage() {
  const [{ meta }, cardsRaw] = await Promise.all([catalog(), api.modelCards()]);
  const cards = Object.fromEntries((cardsRaw as Card[]).map((c) => [c.task, c])) as Record<string, Card>;
  const sc = cards.scorecard, ss = cards.shift_share, ty = cards.typology, dr = cards.drivers, fc = cards.forecast;
  const tyClusters = (ty?.clusters ?? []) as { name: string; size: number; sabah_members: string[] }[];
  const drTargets = (dr?.targets ?? {}) as Record<string, { metrics: Record<string, { r2?: number; mae?: number; mae_sabah?: number } | string | number>; importance: { feature: string; mean_abs_shap: number }[] }>;
  const gdp = (fc?.gdp ?? {}) as { lambda?: number; lambda_grid?: Record<string, number>; median_ape_by_horizon?: Record<string, Record<string, number>>; median_ape_by_division_h3?: Record<string, number>; sabah_coverage_out_of_sample?: Record<string, number>; calibration_group?: string[]; scenarios?: Record<string, { label: string; description: string }>; lights_challenger?: LightsCard };
  const inc = (fc?.income ?? {}) as { rho?: number; median_ape?: Record<string, number>; sabah_coverage_out_of_sample_h2?: number };
  const thresholds = (sc?.thresholds ?? {}) as Record<string, string>;

  return (
    <Container className="py-8">
      <AboutTabs />
      <p className="kicker">Methodology</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">How SabahKu knows what it says</h1>
      <div className="mogah-rule mt-3" aria-hidden />
      <p className="mt-4 max-w-3xl text-muted">
        The plain-language summary comes first in each section, then the technical detail a researcher needs to critique or reproduce it. All numbers on this page are read live from the model cards of data release <strong className="font-mono text-ink">{meta.release?.version}</strong>.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="no-print hidden lg:block">
          <ol className="sticky top-20 space-y-1 font-mono text-[0.7rem] uppercase tracking-wide">
            {TOC.map(([id, label], i) => (
              <li key={id}><a href={`#${id}`} className="text-muted hover:text-laut"><span className="text-faint">{String(i + 1).padStart(2, "0")}</span> {label}</a></li>
            ))}
          </ol>
        </nav>

        <div className="prose-atlas max-w-3xl">
          <h2 id="principles">Principles</h2>
          <ul>
            <li>Every number on screen has a source and a year. Every modelled number has an uncertainty range and is drawn differently (dashed or hatched).</li>
            <li>Rules before models: the scorecard is a published rule anyone can argue with; models are layered on top, each with a model card.</li>
            <li>Models train on all Malaysian districts so Sabah has enough data and meaningful peers; Sabah results are evaluated leave-one-state-out.</li>
            <li>Associations are never presented as causes. Where evidence is thin, the atlas says so.</li>
            <li>Neutral, non-partisan framing: no statements about individual politicians or parties, and no electoral content.</li>
          </ul>

          <h2 id="sources">Sources &amp; vintages</h2>
          <p>Official statistics are the ground truth. Each dataset is downloaded in bulk (never queried live), stored as an immutable, checksummed snapshot with the publisher&apos;s own metadata, and cited with its vintage.</p>
          <div className="not-prose overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase text-muted"><th className="py-1">Dataset</th><th>Publisher</th><th>Data as of</th><th>Last updated</th><th>Licence</th></tr></thead>
              <tbody>
                {meta.sources.map((s) => (
                  <tr key={s.id} className="border-b border-line/70 align-top">
                    <td className="py-1.5 pr-2"><a className="underline decoration-dotted" href={s.url}>{s.title}</a><span className="block font-mono text-[0.62rem] text-muted">{s.dataset_id}</span></td>
                    <td className="pr-2">{s.publisher}</td>
                    <td className="pr-2 font-mono text-xs">{s.data_as_of ?? "—"}</td>
                    <td className="pr-2 font-mono text-xs">{s.last_updated?.slice(0, 10) ?? "—"}</td>
                    <td className="font-mono text-xs">{s.licence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 id="geography">Geography &amp; harmonisation</h2>
          <p>The atlas maps Sabah&apos;s 27 districts on the 2020 boundary layer (geoBoundaries ADM2, CC BY 3.0) and uses all 160 Malaysian districts for context and modelling. Every source name is resolved through a committed alias table; an unknown name stops the pipeline rather than silently failing to join. The alias table covers 193 spellings, e.g. “S.P.Utara”, “Sp Utara” → Seberang Perai Utara; “Nabawan / Persiangan” → Nabawan.</p>
          <p><strong>Boundary changes are flagged, not hidden.</strong> A value is flagged when the area DOSM reports differs from the polygon it is drawn on:</p>
          <ul>
            <li><strong>Membakut</strong> was gazetted out of Beaufort and is reported separately from HIES 2024. Beaufort&apos;s 2024 values exclude Membakut, so Beaufort&apos;s 2024 trend is not scored. Membakut appears in tables but has no polygon yet.</li>
            <li><strong>Kalabakan</strong> is absent from HIES 2019, when it was reported within Tawau; Tawau&apos;s 2019 values are flagged.</li>
            <li><strong>Telupid</strong> is absent from the 2018–19 Labour Force Survey and 2016 amenities data, when it was within Beluran.</li>
            <li>DOSM reports offshore oil &amp; gas output in a separate <strong>“Supra”</strong> row not attributable to any district. It is excluded from district rankings and shift-share, and carried separately in forecasts.</li>
          </ul>

          <p><strong>Night lights.</strong> NASA&apos;s Black Marble annual composites (VNP46A4, ≈500 m) are summarised on the same 2020 polygons: water pixels are masked so offshore platforms and fishing fleets don&apos;t count, radiance is capped at 500 nW·cm⁻²·sr⁻¹ to limit gas flares, and only good-quality retrievals are used. The atlas reports <em>mean</em> radiance over land pixels with a good-quality retrieval, and flags any district-year where fewer than half the land pixels have one. Lights are a proxy for settlement and electrification, not a measure of output: plantations, mines and offshore fields are dark.</p>
          <p><strong>The night map.</strong> When the map shows night lights, the picture under the districts is the same masked composite for that year, cropped to Sabah and drawn on one fixed brightness scale (a log scale topping out at 60 nW·cm⁻²·sr⁻¹) so years compare fairly. The district colours and figures come from the table; the picture only shows where inside each district the light is. The pictures are served at <code>/v1/lights</code>.</p>

          <h2 id="indicators">Indicators</h2>
          <p>{meta.indicators.length} indicators. <em>Direction</em> says whether higher is better (↑), worse (↓) or purely descriptive (·). Percentiles are direction-aware so that 100 is always best; descriptive indicators are ranked by value and never called good or bad.</p>
          <div className="not-prose overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase text-muted"><th className="py-1">Indicator</th><th>Unit</th><th>Dir.</th><th>Years</th><th>Source</th></tr></thead>
              <tbody>
                {meta.indicators.map((i) => (
                  <tr key={i.code} className="border-b border-line/70 align-top">
                    <td className="py-1.5 pr-2">{i.label}<span className="block text-xs text-muted">{i.description}</span></td>
                    <td className="pr-2 text-xs">{i.unit}</td>
                    <td className="pr-2 font-mono">{i.direction === "up" ? "↑" : i.direction === "down" ? "↓" : "·"}</td>
                    <td className="pr-2 font-mono text-xs">{i.periods?.length ? `${i.periods[0]}–${i.periods[i.periods.length - 1]}` : "—"}</td>
                    <td className="font-mono text-xs">{i.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 id="scorecard">Scorecard rules</h2>
          <p>Each district is compared with the median of its five structural peers (see typology) in the same year, and with its own trend between the last two observations.</p>
          <ul>
            <li><strong>Strength</strong>: above peers by more than the level threshold <em>and</em> not worsening.</li>
            <li><strong>Concern</strong>: below peers by more than the level threshold <em>and</em> not improving.</li>
            <li><strong>Mixed</strong>: above peers but worsening, or below peers but improving.</li>
            <li>{thresholds.level}</li>
            <li>{thresholds.trend}</li>
          </ul>
          <Limits card={sc} />

          <h2 id="shift-share">Shift-share decomposition</h2>
          <p>District GDP growth is split into three parts that add up exactly: what the district would have grown at the benchmark&apos;s overall rate; an <strong>industry-mix</strong> effect (was it specialised in fast-growing sectors?); and a <strong>competitive</strong> effect (did its sectors outperform the same sectors elsewhere?). Benchmarks are Sabah and Malaysia, over 2015–2019 (pre-pandemic, default) and 2015–2020.</p>
          <p className="font-mono text-xs">NS = E₀·G · IM = E₀·(gᵢ − G) · CE = E₀·(rᵢ − gᵢ) · NS + IM + CE = E₁ − E₀</p>
          <Limits card={ss} />

          <h2 id="typology">Typology &amp; structural peers</h2>
          <p>
            Ten standardised features for {String(ty?.training_units ?? "")} districts (log median income, log GDP per capita, square-root sector shares, log density, share aged 65+, labour participation, piped-water access) are reduced with PCA ({String(ty?.pca_components ?? "")} components, 85% of variance) and clustered with k-means. k = {String(ty?.k ?? "")} was chosen as the smallest k within 0.01 of the best silhouette ({Object.entries((ty?.silhouette ?? {}) as Record<string, number>).map(([k, v]) => `k=${k}: ${v.toFixed(3)}`).join(", ")}). A silhouette near 0.2 means Malaysian districts form a continuum rather than sharp types, so the <em>peers</em> (nearest neighbours) matter more than the cluster labels.
          </p>
          <p>Welfare outcomes (poverty, inequality, unemployment) are deliberately left out of the typology so that peers are structurally similar, and outcomes can then be compared against them.</p>
          <div className="not-prose">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase text-muted"><th className="py-1">Type (rule-named)</th><th className="text-right">Districts</th><th className="pl-4">Sabah members</th></tr></thead>
              <tbody>
                {tyClusters.map((c) => (
                  <tr key={c.name} className="border-b border-line/70 align-top">
                    <td className="py-1.5">{c.name}</td>
                    <td className="text-right font-mono">{c.size}</td>
                    <td className="pl-4 text-xs text-muted">{c.sabah_members.map((m) => m.replace("sbh-", "").replace(/-/g, " ")).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3"><strong>Naming rules</strong> (applied in order to cluster centroids, in z-scores): density &gt; 1 and income &gt; 1 → Metropolitan &amp; industrial core; piped water &lt; −1 → Remote interior, low service access; mining &gt; 1 → Rural economy with mining &amp; quarrying; agriculture &gt; 0.7 and aged 65+ &gt; 0.8 → Ageing agricultural heartland; agriculture &gt; 0.7 → Plantation &amp; agrarian frontier; manufacturing &gt; 1 → Industrial district; services &gt; 0.3 → Services-led towns &amp; suburbs; otherwise Rural mixed economy.</p>
          <p><strong>Positive deviance</strong>: among a district&apos;s ten nearest neighbours, the one whose welfare improved most since 2019 (median income growth %/yr minus change in poverty, pp/yr), with the structural features where it differs most. A lead to investigate, not a prescription.</p>
          <Limits card={ty} />

          <h2 id="drivers">Driver analysis</h2>
          <p>How far does a district sit above or below what its structure would typically produce, and which factors are associated with that expectation? Two models are trained on all districts × survey rounds (2019, 2022, 2024) with cross-validation grouped by district. The simpler ridge regression is kept unless LightGBM&apos;s error is at least 5% lower.</p>
          <div className="not-prose">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase text-muted"><th className="py-1">Target</th><th>Champion</th><th className="text-right">CV R² (ridge / GBM)</th><th className="text-right">CV MAE</th><th className="text-right">MAE, Sabah</th></tr></thead>
              <tbody>
                {Object.entries(drTargets).map(([t, v]) => {
                  const m = v.metrics as Record<string, { r2?: number; mae?: number; mae_sabah?: number }> & { champion: string };
                  const champ = m[m.champion as unknown as string] as { mae?: number; mae_sabah?: number };
                  return (
                    <tr key={t} className="border-b border-line/70">
                      <td className="py-1.5">{t === "income_median" ? "Median income (log)" : "Absolute poverty (pp)"}</td>
                      <td className="font-mono text-xs">{m.champion as unknown as string}</td>
                      <td className="text-right font-mono text-xs">{num(m.ridge?.r2, 2)} / {num(m.lightgbm?.r2, 2)}</td>
                      <td className="text-right font-mono text-xs">{num(champ?.mae, t === "income_median" ? 0 : 1)}</td>
                      <td className="text-right font-mono text-xs">{num(champ?.mae_sabah, t === "income_median" ? 0 : 1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Limits card={dr} />

          <h2 id="forecast">Nowcasts &amp; projections</h2>
          <p><strong>GDP.</strong> DOSM publishes district GDP to 2020 but Sabah&apos;s state GDP by sector to 2025. Each district&apos;s 2020 sector mix is grown at Sabah&apos;s published sector growth (top-down), adjusted by a shrunk version of its own pre-2020 drift against the state (bottom-up, shrinkage λ = {String(gdp.lambda ?? "")} chosen on other states&apos; backtests), then reconciled so the districts move exactly with the published state sector totals. Offshore “Supra” output is carried separately. Projections to 2028 extend state sector growth at its non-pandemic median, with transparent scenario shifts.</p>
          <div className="not-prose overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="pb-1 text-left font-mono text-[0.62rem] uppercase text-muted">Backtest: median absolute % error, nowcasting 2018–2020 from 2017</caption>
              <thead><tr className="border-b border-ink/60 text-left font-mono text-[0.62rem] uppercase text-muted"><th className="py-1">Model</th><th className="text-right">1 yr</th><th className="text-right">2 yr</th><th className="text-right">3 yr</th></tr></thead>
              <tbody>
                {[
                  ["chosen_model_national", "Atlas model, all districts"],
                  ["chosen_model_sabah_loso", "Atlas model, Sabah (leave-one-state-out)"],
                  ["industry_mix_only_national", "Industry mix only (λ = 0)"],
                  ["naive_constant_share_national", "Naive: constant share of state GDP"],
                ].map(([k, label]) => (
                  <tr key={k} className="border-b border-line/70">
                    <td className="py-1.5">{label}</td>
                    {["1", "2", "3"].map((h) => <td key={h} className="text-right font-mono text-xs">{num(gdp.median_ape_by_horizon?.[k]?.[h])}%</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <LightsChallenger c={gdp.lights_challenger} />
          <p className="mt-3"><strong>Intervals</strong> are 80% split-conformal intervals from backtest errors, calibrated on East Malaysian districts ({gdp.calibration_group?.join(", ")}) because Sabah is more volatile than the peninsula. <strong>Honest check:</strong> calibrated <em>without</em> Sabah, the intervals covered {pct(gdp.sabah_coverage_out_of_sample?.["1"])}, {pct(gdp.sabah_coverage_out_of_sample?.["2"])} and {pct(gdp.sabah_coverage_out_of_sample?.["3"])} of Sabah outcomes at 1–3 years, below the nominal 80%. That is why the regional calibration is used; with 27 districts these coverage figures are themselves uncertain by about ±8 points. Beyond 3 years, intervals widen with √h and add state-path uncertainty.</p>
          <p><strong>Median income.</strong> Projection = latest survey value × the state&apos;s long-run median-income trend, plus ρ × the district&apos;s recent excess growth. The backtest chose ρ = {String(inc.rho ?? "")}: a district&apos;s recent excess growth did <em>not</em> help predict its next round (it mean-reverts), so projections follow the state trend. Median error predicting 2024 from 2022: {num(inc.median_ape?.h2_national)}% nationally, {num(inc.median_ape?.h2_sabah_loso)}% in Sabah (out-of-sample coverage {pct(inc.sabah_coverage_out_of_sample_h2)}). The 2019→2022 backtest spans the pandemic ({num(inc.median_ape?.h3_state_trend_only_national)}% error) and is reported, not used.</p>
          {gdp.scenarios && (
            <>
              <h3>Scenarios</h3>
              <ul>{Object.entries(gdp.scenarios).map(([k, s]) => <li key={k}><strong>{s.label}</strong>: {s.description}</li>)}</ul>
            </>
          )}
          <Limits card={fc} />

          <h2 id="analyst">AI Analyst</h2>
          <p>The Analyst answers questions and drafts district briefs using read-only tools over this database and a curated document corpus. Every factual sentence must carry a data citation [D#] (indicator, value, source, vintage) or a document citation [R#] (document, page, link). A validator checks that each [D#] exists and that the quoted number matches the database; uncited numbers are removed. Published briefs pass human review; ad-hoc answers are labelled “AI-generated, unreviewed”. See the <Link href="/analyst">Analyst</Link> page for its evaluation results.</p>

          <h2 id="errata">Errata &amp; corrections</h2>
          {meta.errata?.length ? (
            <ul>{meta.errata.map((e, i) => <li key={i}><span className="font-mono text-xs">{e.source_id} · {e.district_id} · {e.period}{e.indicator ? ` · ${e.indicator}` : ""}</span>: {e.reason} <span className="text-muted">(found {e.found})</span></li>)}</ul>
          ) : <p>No source values are currently excluded.</p>}
          <p>Spot a problem? Open an issue on <a href="https://github.com/IlhamKassim/sabah-atlas/issues">GitHub</a>; corrections are logged here and in the release changelog.</p>

          <h2 id="reproduce">Reproduce everything</h2>
          <p>The code is open (MIT). One command rebuilds the whole atlas from the public sources:</p>
          <pre className="not-prose overflow-x-auto bg-night p-3 font-mono text-xs text-on-night">git clone https://github.com/IlhamKassim/sabah-atlas{"\n"}cd sabah-atlas && docker compose up -d db && uv sync{"\n"}uv run atlas build   # ingest → harmonise → gold → models → publish → load</pre>
          <p>Model versions in this release: {meta.release?.manifest.model_versions.map((v) => <code key={v} className="mr-1">{v}</code>)}</p>
        </div>
      </div>
    </Container>
  );
}

function Limits({ card }: { card?: Card }) {
  if (!card?.limitations?.length) return null;
  return (
    <div className="not-prose mt-3 border-l-4 border-kunyit bg-panel/60 p-3 text-sm">
      <p className="font-mono text-[0.66rem] uppercase tracking-wider text-kunyit-ink">Known limitations · {card.model_version}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">{card.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}

function LightsChallenger({ c }: { c?: LightsCard }) {
  if (!c?.available) return <p className="mt-3"><strong>Night-lights challenger.</strong> Not run for this release (the NASA source was not loaded).</p>;
  const m = c.median_ape_by_horizon ?? {};
  const row = (k: string) => ["1", "2", "3"].map((h) => `${num(m[k]?.[h])}%`).join(" / ");
  return (
    <p className="mt-3">
      <strong>Night-lights challenger.</strong> A second nowcast tilts each district&apos;s share of the state total by how fast its night lights grew relative to the state&apos;s, with elasticity β chosen on other states&apos; backtests. With β = {c.challenger_beta}, median error at 1/2/3 years is {row("challenger_other_states")} against {row("champion_other_states")} for the sector-only model in other states, and {row("challenger_sabah")} against {row("champion_sabah")} in Sabah.{" "}
      {c.adopted ? <>It clears the 5% improvement bar, so the published nowcasts use it.</> : <>Every positive β raised the error (year-to-year noise in the lights outweighs their signal at these horizons), so it is reported here but <strong>not used</strong>; lights remain a descriptive indicator.</>}
    </p>
  );
}
