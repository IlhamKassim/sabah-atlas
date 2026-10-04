import type { MetadataRoute } from "next";

import { api } from "@/lib/api";
import { SITE } from "@/lib/site";

const PAGES = ["", "/overview", "/compare", "/forecasts", "/analyst", "/methodology", "/data", "/about"];

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [meta, districts] = await Promise.all([api.meta().catch(() => null), api.districts().catch(() => [])]);
  const lastModified = meta?.release ? new Date(meta.release.created_at) : undefined;
  return [
    ...PAGES.map((p) => ({ url: `${SITE}${p}`, lastModified, priority: p ? 0.7 : 1 })),
    ...districts.flatMap((d) => [
      { url: `${SITE}/district/${d.slug}`, lastModified, priority: 0.8 },
      ...(d.kind === "district" ? [{ url: `${SITE}/district/${d.slug}/brief`, lastModified, priority: 0.5 }] : []),
    ]),
  ];
}
