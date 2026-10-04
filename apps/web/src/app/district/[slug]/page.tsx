import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CiteButton } from "@/components/cite-button";
import { HomeStar } from "@/components/home-star";
import { CitedMarkdown } from "@/components/cited-markdown";
import { DriversChart } from "@/components/drivers-chart";
import { FanChart } from "@/components/fan-chart";
import { Jalur, JalurLegend } from "@/components/jalur";
import { JsonLd } from "@/components/json-ld";
import { SabahMap } from "@/components/sabah-map";
import { ShiftShareChart } from "@/components/shift-share-chart";
import { Sparkline } from "@/components/sparkline";
import { Container, Pill, SectionTitle, SourceNote } from "@/components/ui";
import { api, ApiError, type Indicator, type Obs, publicApiUrl, type ScoreItem, type Source } from "@/lib/api";
import { catalog, jalurCells, latest } from "@/lib/data";
import { explainFlag, fmt, ordinal, signed } from "@/lib/format";
import { projectSabahInContext } from "@/lib/geo";
import { nightImagery, type NightImagery } from "@/lib/lights";
import { scoreSentence, VERDICT_LABEL } from "@/lib/narrative";
import { DIVISION_HEX, sequentialQuantiles } from "@/lib/scales";
import { districtDataset } from "@/lib/structured-data";

// Rendered on first visit and then served from cache, refreshed in the background as its API data expires
// (60 s for the brief, 5 min otherwise). Nothing is prerendered at build, so builds never need the API.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

async function load(slug: string) {
  try {
    return await api.district(slug);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/district/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  return {
    title: `${p.district.name} district profile`,
    description: `Economic profile of ${p.district.name}, ${p.district.division} Division, Sabah: indicators, diagnostics, peers and projections with sources.`,
    alternates: { canonical: `/district/${slug}` },
  };
}

const KPIS = ["income_median", "poverty_absolute", "gdp_per_capita", "unemployment_rate"];
const TABLE_ORDER = ["welfare", "labour", "access", "structure", "demography", "momentum", "lights"];

export default async function DistrictPage({ params }: PageProps<"/district/[slug]">) {
  const { slug } = await params;
  const [p, cat, national, geo, brief, lightsNow, imagery] = await Promise.all([
    load(slug), catalog(), api.districts("national"), projectSabahInContext(1000, 820), api.brief(slug).catch(() => null),
    api.indicator("ntl_radiance_total").catch(() => null), nightImagery(1000, 820, 40),
  ]);
  const lightsFirst = lightsNow ? await api.indicator("ntl_radiance_total", lightsNow.periods[0]).catch(() => null) : null;
  const { indicators: ind, sources } = cat;
  const names = Object.fromEntries(national.map((d) => [d.id, { name: d.name, state: d.state, slug: d.slug }]));
  const d = p.district;
  const a = p.analytics;
  const score = a.scorecard?.items ?? [];
  const byCode = Object.fromEntries(score.map((s) => [s.indicator, s])) as Record<string, ScoreItem>;
  const src = (o?: Obs) => (o ? sources[o.source_id] ?? null : null);
  const surveyYear = latest(p.indicators.income_median)?.period;
  const gdpYear = latest(p.indicators.gdp_real)?.period;
  const peerIds = a.typology?.peers.map((x) => x.district_id) ?? [];
  const strengths = score.filter((s) => s.verdict === "strength");
  const concerns = score.filter((s) => s.verdict === "concern");
  const mixed = score.filter((s) => s.verdict === "mixed");
  const divColor = DIVISION_HEX[d.division ?? ""] ?? "var(--ink)";
  const fc = a.forecast?.indicators ?? {};

  return (
    <article>
      <JsonLd data={districtDataset(d, cat.meta.release)} />
      <div className="border-b border-line bg-panel/60">
        <Container className="py-7">
          <nav aria-label="Breadcrumb" className="font-mono text-[0.72rem] uppercase tracking-wider text-mogah">
            <Link href={`/?division=${encodeURIComponent(d.division ?? "")}`} className="hover:underline">{d.division} Division</Link>
            <span className="mx-2 text-faint">/</span>
            <span className="text-muted">District profile</span>
          </nav>
          <div className="mt-2 grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{d.name}</h1>
                {d.kind === "district" && <HomeStar slug={d.slug} name={d.name} />}
              </div>
              <p className="mt-2 text-sm text-muted">
                Typology: <strong className="font-medium text-ink">{a.typology?.cluster ?? "—"}</strong>
                {peerIds.length > 0 && (
                  <>
                    {" · "}Structural peers:{" "}
                    {peerIds.slice(0, 3).map((id, i) => (
                      <span key={id}>
                        {i > 0 && ", "}
                        {id.startsWith("sbh-") ? <Link className="underline decoration-dotted underline-offset-2 hover:text-laut" href={`/district/${names[id]?.slug}`}>{names[id]?.name}</Link> : `${names[id]?.name} (${names[id]?.state})`}
                      </span>
                    ))}
                  </>
                )}
                {" · "}Latest survey {surveyYear ?? "—"} · district GDP {gdpYear ?? "—"}
              </p>
              <div className="mt-4">
                <Jalur cells={jalurCells(p.indicators, ind)} showLabels title={`${d.name} signature strip`} />
                <div className="mt-2"><JalurLegend /></div>
              </div>
              {p.children.length > 0 && (
                <p className="mt-3 text-xs text-mogah">⚑ {p.children.map((c) => c.name).join(", ")} was gazetted out of {d.name}; from {p.children[0].first_period} DOSM reports it separately, so {d.name}&apos;s later figures cover a smaller area than the map polygon.</p>
              )}
            </div>
            <div className="hidden md:block">
              <SabahMap
                width={geo.width}
                height={geo.height}
                districts={geo.districts}
                context={{ path: geo.context, labels: geo.contextLabels }}
                data={Object.fromEntries(geo.districts.map((g) => [g.id, { fill: g.id === d.id ? divColor : "var(--nodata)", label: g.id === d.id ? "Open on the map" : "Open profile" }]))}
                highlight={[d.id]}
                zoomTo={d.id}
                hrefFor={{ [d.slug]: `/?d=${d.slug}` }}
                ariaLabel={`Location of ${d.name} in Sabah`}
              />
              <Link href={`/?d=${d.slug}`} className="mt-1.5 block text-right font-mono text-[0.66rem] uppercase tracking-wider text-muted hover:text-kunyit">Open on the map →</Link>
            </div>
          </div>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <CiteButton title={`${d.name} district profile`} />
            <a href={`${publicApiUrl}/v1/export/${d.slug}.csv`} className="border border-ink px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider hover:bg-ink hover:text-bg">Download CSV</a>
            <Link href={`/compare?ids=${d.slug}${peerIds.filter((i) => i.startsWith("sbh-")).slice(0, 2).map((i) => `,${names[i]?.slug}`).join("")}`} className="border border-line px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-wider text-muted hover:border-ink hover:text-ink">Compare with peers</Link>
          </div>
        </Container>
      </div>

      <Container className="py-8">
        {/* KPIs */}
        <section aria-label="Headline indicators" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KPIS.map((code) => {
            const o = latest(p.indicators[code]);
            const i = ind[code];
            const s = byCode[code];
            if (!o || !i) return null;
            const better = s && s.level === "above";
            const worse = s && s.level === "below";
            return (
              <div key={code} className="dastar p-3.5">
                <p className="text-xs text-muted">{i.label}</p>
                <p className="mt-1 font-mono text-2xl tabular text-ink">{fmt(o.value, i.format)}</p>
                <p className="mt-1 text-xs">
                  {s?.peer_median != null && (
                    <span className={better ? "text-laut" : worse ? "text-mogah" : "text-muted"}>
                      {better ? "▲ better than" : worse ? "▼ worse than" : "≈ in line with"} peers ({fmt(s.peer_median, i.format)})
                    </span>
                  )}
                </p>
                {o.rank_sabah && <p className="text-xs text-muted">{ordinal(o.rank_sabah)} of {o.n_sabah} in Sabah</p>}
                <SourceNote className="mt-2" source={src(o)} period={o.period} flag={o.quality_flag?.includes("boundary") ? o.quality_flag : null} />
              </div>
            );
          })}
        </section>

        {/* Scorecard */}
        <section className="mt-12">
          <SectionTitle kicker="Diagnose" title="What's working, what's holding it back">
            Rule-based, not a black box: a <strong>strength</strong> is above its structural peers and not worsening; a{" "}
            <strong>concern</strong> is below peers and not improving. <Link className="underline" href="/methodology#scorecard">Thresholds are published</Link>.
          </SectionTitle>
          <div className="grid gap-6 md:grid-cols-2">
            <ScoreColumn title="What's working" tone="good" items={strengths} ind={ind} sources={sources} empty="No indicator is clearly above peers and holding steady." />
            <ScoreColumn title="What's holding it back" tone="bad" items={concerns} ind={ind} sources={sources} empty="No indicator is clearly below peers without improving." />
          </div>
          {mixed.length > 0 && (
            <div className="mt-6">
              <p className="kicker text-muted">Mixed signals</p>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {mixed.map((s) => (
                  <li key={s.indicator} className="border-l-2 border-kunyit pl-3 text-sm">
                    {scoreSentence(s, ind[s.indicator])}
                    <SourceNote source={sources[s.source_id]} period={s.period} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Forecasts */}
        {(fc.gdp_real || fc.income_median) && (
          <section className="mt-12">
            <SectionTitle kicker="Project" title="Where the economy is heading">
              DOSM last published district GDP for 2020. Values after that are <strong>nowcasts</strong> built from Sabah&apos;s published sector growth, then <strong>projections</strong> to 2028. Shaded bands are 80% intervals calibrated on backtests; <Link className="underline" href="/methodology#forecast">see the model card</Link>.
            </SectionTitle>
            <div className="grid gap-8 lg:grid-cols-2">
              {fc.gdp_real && (
                <FanChart
                  series={fc.gdp_real}
                  format="number0"
                  title="Real GDP, RM million (2015 prices)"
                  filename={`gdp-fan-${d.slug}`}
                  caption={<>Official: DOSM gdp_district_real_supply (to 2020). Nowcast &amp; projection: model {a.forecast?.model_version}. Backtest error at 3 years: {fc.gdp_real.backtest.abs_pct_error_by_h["3"]?.toFixed(1) ?? "—"}% for this district.</>}
                />
              )}
              {fc.income_median && (
                <FanChart
                  series={fc.income_median}
                  format="currency"
                  title="Median household income, RM / month (nominal)"
                  filename={`income-fan-${d.slug}`}
                  caption={<>Official: DOSM hh_income_district (2019, 2022, 2024). Projection follows Sabah&apos;s long-run trend{fc.income_median.notes?.length ? "; " + fc.income_median.notes.join(" ") : ""}.</>}
                />
              )}
            </div>
          </section>
        )}

        {/* Shift-share */}
        {a.shift_share && (
          <section className="mt-12">
            <SectionTitle kicker="Diagnose · why" title="Luck of the sector mix, or its own merit?">
              Shift-share splits GDP growth into what Sabah (or Malaysia) grew anyway, what the district&apos;s sector mix added, and a <strong>competitive effect</strong>: how its sectors did against the same sectors elsewhere, the most honest answer to “is it doing well on its own merits?”
            </SectionTitle>
            <div className="max-w-3xl"><ShiftShareChart windows={a.shift_share.windows} name={d.name} /></div>
            {a.shift_share.suppressed.length > 0 && <p className="source-note mt-2">DOSM suppresses sector values below RM5 mil ({a.shift_share.suppressed.slice(0, 3).join(", ")}{a.shift_share.suppressed.length > 3 ? "…" : ""}); treated as zero.</p>}
          </section>
        )}

        {/* Drivers */}
        {a.drivers && (a.drivers.income_median || a.drivers.poverty_absolute) && (
          <section className="mt-12">
            <SectionTitle kicker="Diagnose · associated factors" title="Above or below what its structure predicts?">
              A model trained on all Malaysian districts estimates what a district with this structure would typically record. The gap and the factors behind the estimate are <em>associations</em>, not causes.
            </SectionTitle>
            <div className="grid gap-8 lg:grid-cols-2">
              {(["income_median", "poverty_absolute"] as const).map((t) => {
                const r = a.drivers?.[t];
                if (!r || typeof r !== "object" || !("actual" in r)) return null;
                const i = ind[t];
                return (
                  <div key={t}>
                    <p className="font-display text-[1.02rem] font-semibold">{i.label}, {r.round}</p>
                    <p className="mt-1 text-sm">
                      Actual <strong className="font-mono">{fmt(r.actual, i.format)}</strong> vs expected <strong className="font-mono">{fmt(r.expected, i.format)}</strong>:{" "}
                      <Pill tone={r.reading.startsWith("better") ? "good" : r.reading.startsWith("worse") ? "bad" : "neutral"}>{r.reading}</Pill>
                    </p>
                    <div className="mt-3"><DriversChart result={r} format={i.format} name={d.name} betterWhenHigher={i.direction !== "down"} /></div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Peers */}
        {a.typology && (
          <section className="mt-12">
            <SectionTitle kicker="Compare" title="Structural peers">
              The five districts nationally most similar in economic structure (income level, GDP per capita, sector mix, density, age, labour participation, water access), whatever their state.
            </SectionTitle>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <ol className="divide-y divide-line border-y border-line">
                {a.typology.peers.map((peer, i) => (
                  <li key={peer.district_id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span>
                      <span className="mr-2 font-mono text-xs text-faint">{i + 1}</span>
                      {peer.district_id.startsWith("sbh-") ? (
                        <Link className="hover:text-laut hover:underline" href={`/district/${names[peer.district_id]?.slug}`}>{names[peer.district_id]?.name}</Link>
                      ) : (
                        names[peer.district_id]?.name
                      )}
                      <span className="ml-1 text-xs text-muted">{names[peer.district_id]?.state}</span>
                    </span>
                    <span className="text-right text-xs text-muted">{peer.cluster}</span>
                  </li>
                ))}
              </ol>
              {a.typology.positive_deviant ? (
                <div className="dastar p-4 text-sm">
                  <p className="kicker">Positive deviance</p>
                  <p className="mt-1">
                    Among its ten nearest structural neighbours, <strong>{names[a.typology.positive_deviant.district_id]?.name}</strong> ({names[a.typology.positive_deviant.district_id]?.state}) improved fastest since 2019: welfare momentum {signed(a.typology.positive_deviant.improvement, 1)} vs {signed(a.typology.positive_deviant.own_improvement, 1)} here (income growth %/yr minus poverty change pp/yr).
                  </p>
                  <p className="mt-2 text-muted">Where it differs most:</p>
                  <ul className="mt-1 space-y-0.5">
                    {a.typology.positive_deviant.differences.map((f) => (
                      <li key={f.key} className="font-mono text-xs">{f.feature}: {f.z_diff > 0 ? "higher" : "lower"} ({f.own_value.toFixed(2)} → {f.peer_value.toFixed(2)}{f.key.startsWith("log") ? ", log" : f.key.startsWith("share") ? ", √share" : ""})</li>
                    ))}
                  </ul>
                  <p className="source-note mt-2">A lead to investigate, not a prescription.</p>
                </div>
              ) : (
                <p className="text-sm text-muted">{d.name} improved at least as fast as its ten nearest structural neighbours since 2019.</p>
              )}
            </div>
          </section>
        )}

        {/* After dark */}
        {lightsNow && lightsFirst && <AfterDark name={d.name} id={d.id} geo={geo} first={lightsFirst} last={lightsNow} imagery={imagery} format={ind.ntl_radiance_total?.format ?? "number1"} />}

        {/* All indicators */}
        <section className="mt-12">
          <SectionTitle kicker="Data" title="Every indicator, with its source" />
          <IndicatorTable indicators={p.indicators} ind={ind} sources={sources} />
        </section>

        <section className="mt-12">
          <SectionTitle kicker="Advise" title="AI Analyst brief" />
          <div className="dastar max-w-3xl p-4 text-sm">
            {brief ? (
              <>
                <p className="mb-2"><Pill tone={brief.status === "reviewed" ? "good" : "warn"}>{brief.status === "reviewed" ? `Reviewed by ${brief.reviewer}` : "AI-generated · unreviewed draft"}</Pill></p>
                <CitedMarkdown text={brief.body_md.split("## Strengths")[0]} citations={brief.citations} />
                <p className="mt-2"><Link className="underline" href={`/district/${d.slug}/brief`}>Read the full brief with sources</Link> · <Link className="underline" href={`/analyst?district=${d.slug}`}>Ask a follow-up</Link></p>
              </>
            ) : (
              <p>No brief has been generated for {d.name} yet. <Link className="underline" href={`/analyst?district=${d.slug}`}>Ask the Analyst about {d.name}</Link>.</p>
            )}
          </div>
        </section>
      </Container>
    </article>
  );
}

function ScoreColumn({ title, tone, items, ind, sources, empty }: { title: string; tone: "good" | "bad"; items: ScoreItem[]; ind: Record<string, Indicator>; sources: Record<string, Source>; empty: string }) {
  return (
    <div className={`border-t-4 ${tone === "good" ? "border-laut" : "border-mogah"} dastar p-4`}>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((s) => (
            <li key={s.indicator} className="text-sm leading-relaxed">
              <span className={`mr-1.5 font-mono ${tone === "good" ? "text-laut" : "text-mogah"}`}>{tone === "good" ? "+" : "−"}</span>
              {scoreSentence(s, ind[s.indicator])}
              <span className="ml-1"><Pill tone={tone}>{VERDICT_LABEL[s.verdict]}</Pill></span>
              <SourceNote source={sources[s.source_id]} period={s.period} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IndicatorTable({ indicators, ind, sources }: { indicators: Record<string, Obs[]>; ind: Record<string, Indicator>; sources: Record<string, Source> }) {
  const codes = Object.keys(indicators).filter((c) => ind[c]).sort((a, b) => TABLE_ORDER.indexOf(ind[a].category) - TABLE_ORDER.indexOf(ind[b].category) || a.localeCompare(b));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink/60 text-left font-mono text-[0.66rem] uppercase tracking-wide text-muted">
            <th className="py-1.5">Indicator</th>
            <th className="py-1.5 text-right">Latest</th>
            <th className="py-1.5 pl-3">Year</th>
            <th className="py-1.5">Trend</th>
            <th className="py-1.5">Sabah rank</th>
            <th className="py-1.5">Source</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => {
            const s = indicators[c];
            const o = s[s.length - 1];
            const i = ind[c];
            return (
              <tr key={c} className="border-b border-line/70 align-top">
                <td className="py-1.5 pr-3">{i.label}<span className="block text-xs text-muted">{i.unit}</span></td>
                <td className="py-1.5 text-right font-mono tabular">{fmt(o.value, i.format)}</td>
                <td className="py-1.5 pl-3 font-mono text-xs">{o.period}</td>
                <td className="py-1.5"><Sparkline series={s} /></td>
                <td className="py-1.5 font-mono text-xs">{o.rank_sabah ? `${o.rank_sabah}/${o.n_sabah}` : "—"}{i.direction === "neutral" && o.rank_sabah ? <span className="text-faint"> (desc.)</span> : null}</td>
                <td className="py-1.5 font-mono text-[0.68rem] text-muted">
                  {o.source_id === "derived" ? "Derived" : sources[o.source_id]?.dataset_id}
                  {o.quality_flag && <span className="block text-mogah">⚑ {explainFlag(o.quality_flag)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type LightsYear = Awaited<ReturnType<typeof api.indicator>>;

/** The district at night, first year of satellite lights against the latest, zoomed on it. */
function AfterDark({ name, id, geo, first, last, imagery, format }: {
  name: string; id: string; geo: Awaited<ReturnType<typeof projectSabahInContext>>; first: LightsYear; last: LightsYear;
  imagery: NightImagery | null; format: string;
}) {
  const tint = sequentialQuantiles([...first.values, ...last.values].map((v) => v.value), "lights");
  const own = (y: LightsYear) => y.values.find((v) => v.district_id === id);
  const a = own(first), b = own(last);
  if (!a || !b) return null;
  const change = a.value ? (100 * (b.value - a.value)) / a.value : null;
  const panel = (y: LightsYear) => (
    <figure key={y.period}>
      <SabahMap
        width={geo.width}
        height={geo.height}
        districts={geo.districts}
        context={{ path: geo.context }}
        data={Object.fromEntries(y.values.map((v) => [v.district_id, { fill: tint(v.value), label: `${fmt(v.value, format)} total light`, sub: String(y.period) }]))}
        glow={Object.fromEntries(y.values.map((v) => [v.district_id, v.value]))}
        imagery={imagery}
        year={y.period}
        highlight={[id]}
        zoomTo={id}
        href="/?indicator=ntl_radiance_mean&d={slug}"
        ariaLabel={`${name} at night, ${y.period}`}
      />
      <figcaption className="mt-1.5 flex items-baseline justify-between font-mono text-xs">
        <span className="text-lg text-ink">{y.period}</span>
        <span className="text-muted">{fmt(own(y)!.value, format)} · {ordinal(own(y)!.rank_sabah ?? 0)} of {own(y)!.n_sabah}</span>
      </figcaption>
    </figure>
  );
  return (
    <section className="mt-12">
      <SectionTitle kicker="Lights" title={`${name} after dark`}>
        NASA&apos;s Black Marble satellite pictures of the district at night, {first.period} against {last.period}
        {change != null && <>: <strong className="font-medium text-ink">{signed(change, 0, "%")}</strong> over {last.period - first.period} years</>}.
        Lights track where people, roads and industry are; they are a proxy, not a measure of output.{" "}
        <Link className="underline decoration-dotted underline-offset-2 hover:text-laut" href={`/?indicator=ntl_radiance_mean&d=${last.values.find((v) => v.district_id === id)?.slug ?? ""}`}>Play every year on the map</Link>.
      </SectionTitle>
      <div className="grid max-w-3xl grid-cols-2 gap-3">{[first, last].map(panel)}</div>
    </section>
  );
}
