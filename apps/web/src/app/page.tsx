import type { Metadata } from "next";

import { Explorer, type ExplorerData } from "@/components/explorer/explorer";
import { api } from "@/lib/api";
import { catalog } from "@/lib/data";
import { DEFAULT_INDICATOR, indicatorView } from "@/lib/explorer-data";
import { projectSabahInContext } from "@/lib/geo";
import { nightImagery } from "@/lib/lights";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  const [{ meta, indicators, sources }, districts, geo, imagery] = await Promise.all([
    catalog(),
    api.districts("sabah"),
    projectSabahInContext(1000, 820),
    nightImagery(1000, 820, 40),
  ]);
  const view = await indicatorView(DEFAULT_INDICATOR, api.indicator, sources[indicators[DEFAULT_INDICATOR].source]);

  const data: ExplorerData = {
    ...view,
    options: meta.indicators
      .filter((i) => (i.periods?.length ?? 0) > 0)
      .map((i) => ({ code: i.code, label: i.label, category: i.category, periods: i.periods!.length })),
    districts: districts.map((d) => ({
      id: d.id, slug: d.slug, name: d.name, division: d.division, kind: d.kind, cluster: d.cluster ?? null, note: d.note,
      headline: d.headline ?? {},
    })),
    headlineFormats: Object.fromEntries(
      ["income_median", "poverty_absolute", "population"].map((c) => [c, { label: indicators[c]?.short ?? c, format: indicators[c]?.format ?? "", unit: indicators[c]?.unit ?? "" }]),
    ),
    release: meta.release?.version ?? null,
    geo,
    imagery,
  };

  return <Explorer data={data} />;
}
