import type { Metadata } from "next";
import Link from "next/link";

import { DivisionChapters, type Chapter } from "@/components/division-chapters";
import { Jalur, JalurLegend } from "@/components/jalur";
import { SabahMap } from "@/components/sabah-map";
import { Container, SectionTitle } from "@/components/ui";
import { api, type District } from "@/lib/api";
import { allJalur, catalog } from "@/lib/data";
import { fmt } from "@/lib/format";
import { projectSabah } from "@/lib/geo";
import { DIVISION_HEX, DIVISIONS } from "@/lib/scales";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

// Every clause below is checked against the data release (medians across the division's
// districts; GDP structure 2020, HIES 2024). Update alongside the data.
const LEDES: Record<string, string> = {
  "West Coast": "Kota Kinabalu and its suburbs: services are about three-quarters of output in the typical district and incomes are the state's highest, yet the capital's median income sits below structural peers such as Kuching and Miri.",
  Interior: "Hill and river districts behind the Crocker Range, where services now make up most of output and poverty is the lowest outside the West Coast. Membakut was gazetted out of Beaufort and is reported separately from 2024.",
  Kudat: "The northern tip, where agriculture is over two-fifths of output and DOSM's 2024 survey found half of Pitas households below the poverty line, the highest share in Sabah.",
  Sandakan: "The Kinabatangan plantation and processing heartland, with manufacturing near a quarter of output, and home to Sabah's three fastest-growing median incomes since 2019: Telupid, Tongod and Beluran.",
  Tawau: "The most agricultural division, with nearly half of district output from agriculture, spanning Tawau's port, Lahad Datu's plantations and the Semporna islands.",
};

function range(ds: District[], code: string, format: string) {
  const vals = ds.map((d) => ({ d, h: d.headline?.[code] })).filter((x) => x.h);
  if (!vals.length) return null;
  vals.sort((a, b) => a.h!.value - b.h!.value);
  const lo = vals[0], hi = vals[vals.length - 1];
  return { value: `${fmt(lo.h!.value, format)} – ${fmt(hi.h!.value, format)}`, note: `${lo.d.name} → ${hi.d.name} · ${lo.h!.period}` };
}

export default async function Overview() {
  const [ds, cat, hero, chapterMap] = await Promise.all([
    api.districts("sabah"),
    catalog(),
    projectSabah(640, 470, 8),
    projectSabah(560, 420, 8),
  ]);
  const jalur = await allJalur(cat.indicators);
  const districts = ds.filter((d) => d.kind === "district");
  const release = cat.meta.release;

  const byDiv = Object.fromEntries(DIVISIONS.map((dv) => [dv, districts.filter((d) => d.division === dv)]));
  const chapters: Chapter[] = DIVISIONS.map((dv) => {
    const list = byDiv[dv];
    const inc = range(list, "income_median", "currency");
    const pov = range(list, "poverty_absolute", "pct");
    const pop = list.reduce((s, d) => s + (d.headline?.population?.value ?? 0), 0);
    const clusters = Object.entries(list.reduce<Record<string, number>>((acc, d) => {
      if (d.cluster) acc[d.cluster] = (acc[d.cluster] ?? 0) + 1;
      return acc;
    }, {})).sort((a, b) => b[1] - a[1]);
    return {
      division: dv,
      color: DIVISION_HEX[dv],
      districts: list.map((d) => ({ id: d.id, slug: d.slug, name: d.name })),
      lede: LEDES[dv],
      facts: [
        { label: "Districts", value: String(list.length) },
        { label: "Population", value: `${fmt(pop, "number0")}k`, note: `mid-${list[0]?.headline?.population?.period ?? ""} estimate` },
        ...(inc ? [{ label: "Median income", ...inc }] : []),
        ...(pov ? [{ label: "Absolute poverty", ...pov }] : []),
        ...(clusters.length ? [{ label: "Most common type", value: clusters[0][0], note: `${clusters[0][1]} of ${list.length} districts` }] : []),
      ],
    };
  });

  const incomes = districts.map((d) => d.headline?.income_median).filter(Boolean) as { value: number; period: number }[];
  const minInc = districts.reduce((m, d) => ((d.headline?.income_median?.value ?? Infinity) < (m.headline?.income_median?.value ?? Infinity) ? d : m), districts[0]);
  const maxInc = districts.reduce((m, d) => ((d.headline?.income_median?.value ?? 0) > (m.headline?.income_median?.value ?? 0) ? d : m), districts[0]);
  const maxPov = districts.reduce((m, d) => ((d.headline?.poverty_absolute?.value ?? 0) > (m.headline?.poverty_absolute?.value ?? 0) ? d : m), districts[0]);
  const heroData = Object.fromEntries(hero.districts.map((d) => [d.id, { fill: DIVISION_HEX[d.division ?? ""] ?? "#333", label: `${d.division} Division` }]));

  return (
    <>
      {/* Intro */}
      <section className="border-b border-line">
        <Container className="grid items-center gap-10 py-12 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:py-16">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-kunyit">
              Data release {release?.version ?? "—"} · 27 districts · 5 divisions
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">Sabah, district by district</h1>
            <p className="mt-4 font-display text-xl text-muted sm:text-2xl">What is working in each of Sabah&apos;s districts, what is holding it back, and where it is heading.</p>
            <p className="mt-5 max-w-lg text-muted">
              Official DOSM statistics, rule-based diagnostics, structural peers across all 160 Malaysian districts, and projections with honest uncertainty. Every number carries its source and year.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/" className="rounded-md bg-laut px-4 py-2 font-mono text-sm uppercase tracking-wider text-bg hover:opacity-90">Open the map</Link>
              <a href="#portrait" className="rounded-md border border-line px-4 py-2 font-mono text-sm uppercase tracking-wider text-ink hover:border-laut hover:text-laut">27 districts at a glance</a>
            </div>
          </div>
          <div>
            <SabahMap width={hero.width} height={hero.height} districts={hero.districts} data={heroData} stroke="var(--bg)" labels={false} ariaLabel="Sabah's 27 districts coloured by division" />
            <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[0.66rem] uppercase tracking-wider text-muted">
              {DIVISIONS.map((dv) => (
                <li key={dv} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: DIVISION_HEX[dv] }} />{dv}</li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      {/* Key contrasts */}
      <section className="border-b border-line bg-panel">
        <Container className="grid gap-6 py-8 sm:grid-cols-3">
          <Fact
            kicker="The income gap"
            value={`${fmt(minInc.headline!.income_median!.value, "currency")} → ${fmt(maxInc.headline!.income_median!.value, "currency")}`}
            text={`Median monthly household income, ${minInc.name} to ${maxInc.name}, ${incomes[0]?.period}.`}
            source="DOSM · hh_income_district"
          />
          <Fact
            kicker="The poverty gap"
            value={`${fmt(maxPov.headline!.poverty_absolute!.value, "pct")}`}
            text={`of households in ${maxPov.name} were below the poverty line in ${maxPov.headline!.poverty_absolute!.period}, the highest in Sabah.`}
            source="DOSM · hh_poverty_district"
          />
          <Fact
            kicker="The data gap"
            value="2020"
            text="is the latest year of published district GDP. The atlas nowcasts 2021–2025 from state sector data and says so on every chart."
            source="DOSM · gdp_district_real_supply"
          />
        </Container>
      </section>

      {/* Portrait: 27 jalur strips */}
      <section id="portrait" className="scroll-mt-16">
        <Container className="py-14">
          <SectionTitle kicker="The state in 27 strips" title="Every district's signature, woven together">
            Each strip is one district: a band per indicator coloured by its percentile within Sabah, grouped like a woven cloth into welfare, structure, momentum and access. Read down a column to compare districts; read across a strip to see a district&apos;s identity.
          </SectionTitle>
          <div className="mb-4"><JalurLegend /></div>
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
            {DIVISIONS.map((dv) => (
              <div key={dv}>
                <p className="mb-2 flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-wider" style={{ color: DIVISION_HEX[dv] }}>
                  <span className="inline-block h-2.5 w-2.5" style={{ background: DIVISION_HEX[dv] }} />{dv} Division
                </p>
                <ul className="space-y-1.5">
                  {byDiv[dv].map((d) => (
                    <li key={d.id}>
                      <Link href={`/district/${d.slug}`} className="group grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3">
                        <span className="truncate text-sm group-hover:text-laut group-hover:underline">{d.name}</span>
                        <Jalur cells={jalur[d.id] ?? {}} height={16} cellWidth={17} gap={1.5} title={`${d.name} signature strip`} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* Chapters */}
      <section className="bg-night text-on-night">
        <Container className="py-6">
          <p className="pt-10 font-mono text-xs uppercase tracking-[0.18em] text-kunyit">Five divisions, five economies</p>
          <DivisionChapters chapters={chapters} map={chapterMap} />
        </Container>
      </section>

      {/* Pillars */}
      <section>
        <Container className="grid gap-6 py-14 md:grid-cols-3">
          <Pillar n="1" title="Diagnose" href="/" text="Transparent scorecards against structural peers, shift-share decomposition of growth, and the factors associated with each district sitting above or below expectations." />
          <Pillar n="2" title="Project" href="/forecasts" text="Nowcasts from published state sector data and 1–3 year projections, each with an 80% interval calibrated on backtests and scenario toggles for commodity shocks." />
          <Pillar n="3" title="Advise" href="/analyst" text="An AI Analyst that answers questions and drafts district briefs, citing a data point or document for every claim, with automated citation checks and human review." />
        </Container>
      </section>
    </>
  );
}

function Fact({ kicker, value, text, source }: { kicker: string; value: string; text: string; source: string }) {
  return (
    <div>
      <p className="kicker">{kicker}</p>
      <p className="mt-1 font-mono text-2xl tabular">{value}</p>
      <p className="mt-1 text-sm text-muted">{text}</p>
      <p className="source-note mt-1">{source}</p>
    </div>
  );
}

function Pillar({ n, title, text, href }: { n: string; title: string; text: string; href: string }) {
  return (
    <Link href={href} className="dastar group block p-5 hover:border-laut">
      <p className="font-mono text-xs text-mogah">0{n}</p>
      <h3 className="mt-1 font-display text-xl font-semibold group-hover:text-laut">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </Link>
  );
}
