import type { Metadata } from "next";
import Link from "next/link";

import { ForecastTable } from "@/components/forecast-table";
import { Container, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { projectSabah } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Forecasts" };

export default async function ForecastsPage() {
  const [fc, map, cards] = await Promise.all([api.analytics("forecast"), projectSabah(520, 390, 8), api.modelCards()]);
  const card = cards.find((c) => c.task === "forecast") as { gdp?: { median_ape_by_horizon?: Record<string, Record<string, number>>; sabah_coverage_out_of_sample?: Record<string, number> }; income?: { median_ape?: Record<string, number> } } | undefined;
  const bt = card?.gdp?.median_ape_by_horizon;
  const rows = fc
    .filter((r) => r.district_id !== "sbh-supra")
    .map((r) => ({ id: r.district_id, slug: r.slug, name: r.name, division: r.division, gdp: r.payload.indicators.gdp_real, income: r.payload.indicators.income_median }));

  return (
    <Container className="py-8">
      <p className="kicker">Project</p>
      <h1 className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl">Nowcasts and projections</h1>
      <div className="mogah-rule mt-3" aria-hidden />
      <p className="mt-4 max-w-3xl text-muted">
        District GDP has not been published since 2020 and household surveys arrive every two to three years, so the atlas has only a handful of official points per district. The response: nowcast from Sabah&apos;s published sector data, calibrate intervals on backtests, and label every modelled value.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Median error, 1-year nowcast" value={bt ? `${bt.chosen_model_national?.["1"]?.toFixed(1)}%` : "—"} note="all Malaysian districts, backtest from 2017" />
        <Stat label="Median error, 3-year nowcast" value={bt ? `${bt.chosen_model_national?.["3"]?.toFixed(1)}%` : "—"} note={`Sabah, leave-one-state-out: ${bt?.chosen_model_sabah_loso?.["3"]?.toFixed(1) ?? "—"}%`} />
        <Stat label="Naive benchmark, 3-year" value={bt ? `${bt.naive_constant_share_national?.["3"]?.toFixed(1)}%` : "—"} note="constant share of state GDP" />
      </div>

      <section className="mt-10">
        <SectionTitle kicker="All districts" title="Where each district is heading">
          Pick a scenario to shift Sabah&apos;s sector growth. These are transparent sensitivities, not predictions of commodity prices. <Link className="underline" href="/methodology#forecast">How the forecasts work</Link>.
        </SectionTitle>
        <ForecastTable rows={rows} map={map} />
      </section>
    </Container>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="dastar p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl">{value}</p>
      <p className="source-note mt-1">{note}</p>
    </div>
  );
}
