import type { Metadata } from "next";

import { CompareView } from "@/components/compare-view";
import { api } from "@/lib/api";
import { catalog } from "@/lib/data";
import { projectSabahInContext } from "@/lib/geo";

export const metadata: Metadata = {
  title: "Compare districts",
  description: "Put up to four Sabah districts side by side: income, poverty, inequality, GDP, jobs, basic services and economic structure, with trajectories over time.",
  alternates: { canonical: "/compare" },
};

export default async function ComparePage() {
  const [ds, cat, geo] = await Promise.all([api.districts("sabah"), catalog(), projectSabahInContext(1000, 820)]);
  const options = ds.filter((d) => d.kind === "district").map((d) => ({ slug: d.slug, name: d.name, division: d.division ?? "" }));
  return <CompareView options={options} geo={{ width: geo.width, height: geo.height, districts: geo.districts, context: geo.context }} ind={cat.indicators} />;
}
