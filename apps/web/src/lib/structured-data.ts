import type { Release } from "./api";
import { SITE } from "./site";

// schema.org Dataset markup, so the releases can surface in Google Dataset Search.
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const CREATOR = { "@type": "Organization", name: "SabahKu", url: SITE };
const SABAH = { "@type": "Place", name: "Sabah, Malaysia" };

const FORMAT: Record<string, string> = { csv: "text/csv", parquet: "application/vnd.apache.parquet", geojson: "application/geo+json", json: "application/json" };

export function atlasDataset(release: Release | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${SITE}/data#dataset`,
    name: "SabahKu: economic atlas of Sabah's districts",
    description:
      "District-level economic indicators for Sabah, Malaysia: household income, poverty, inequality, GDP by sector, labour, access to basic services and demography, with diagnostics, peer typology and nowcasts. Versioned, checksummed releases built from official statistics.",
    url: `${SITE}/data`,
    license: LICENSE,
    isAccessibleForFree: true,
    creator: CREATOR,
    spatialCoverage: SABAH,
    keywords: ["Sabah", "Malaysia", "districts", "household income", "poverty", "GDP", "regional economics"],
    ...(release && {
      version: release.version,
      dateModified: release.created_at,
      distribution: release.manifest.files
        .filter((f) => FORMAT[f.file.split(".").pop() ?? ""])
        .map((f) => ({
          "@type": "DataDownload",
          name: f.file,
          encodingFormat: FORMAT[f.file.split(".").pop() ?? ""],
          contentUrl: `${SITE}/data/releases/${release.version}/${f.file}`,
        })),
    }),
  };
}

export function districtDataset(d: { name: string; slug: string; division?: string | null }, release: Release | null) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${d.name} district economic profile`,
    description: `Economic indicators for ${d.name}${d.division ? `, ${d.division} Division` : ""}, Sabah, Malaysia: household income, poverty, GDP, labour, basic services and demography, with peer comparisons, diagnostics and projections. Each value cites its official source.`,
    url: `${SITE}/district/${d.slug}`,
    license: LICENSE,
    isAccessibleForFree: true,
    creator: CREATOR,
    spatialCoverage: { "@type": "Place", name: `${d.name}, Sabah, Malaysia` },
    isPartOf: { "@id": `${SITE}/data#dataset` },
    ...(release && { version: release.version, dateModified: release.created_at }),
  };
}
