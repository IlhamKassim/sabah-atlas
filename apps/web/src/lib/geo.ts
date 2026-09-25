import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { geoArea, geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export interface DistrictProps {
  id: string;
  slug: string;
  name: string;
  state: string;
  division: string | null;
  area_km2: number;
  lon: number;
  lat: number;
}
export type DistrictFeature = Feature<Polygon | MultiPolygon, DistrictProps>;

let cache: FeatureCollection<Polygon | MultiPolygon, DistrictProps> | null = null;

export async function sabahGeo() {
  if (!cache) {
    const file = path.join(process.cwd(), "public", "data", "geo", "sabah.geojson");
    const fc = JSON.parse(await readFile(file, "utf8")) as FeatureCollection<Polygon | MultiPolygon, DistrictProps>;
    // d3-geo uses spherical winding (clockwise exterior rings); RFC 7946 GeoJSON is the
    // opposite. A feature whose area exceeds a hemisphere is inside-out: reverse its rings.
    for (const f of fc.features) {
      if (geoArea(f) > 2 * Math.PI) {
        if (f.geometry.type === "Polygon") f.geometry.coordinates.forEach((r) => r.reverse());
        else f.geometry.coordinates.forEach((p) => p.forEach((r) => r.reverse()));
      }
    }
    cache = fc;
  }
  return cache!;
}

export interface ProjectedDistrict {
  id: string;
  slug: string;
  name: string;
  division: string | null;
  d: string;
  cx: number;
  cy: number;
}

/** Project Sabah's districts into SVG paths for a given viewport (server-side). */
export async function projectSabah(width: number, height: number, pad = 12) {
  const fc = await sabahGeo();
  const projection = geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], fc);
  const pathGen = geoPath(projection);
  const districts: ProjectedDistrict[] = fc.features.map((f) => {
    const [cx, cy] = projection([f.properties.lon, f.properties.lat]) ?? [0, 0];
    return {
      id: f.properties.id,
      slug: f.properties.slug,
      name: f.properties.name,
      division: f.properties.division,
      d: pathGen(f) ?? "",
      cx,
      cy,
    };
  });
  return { width, height, districts };
}
