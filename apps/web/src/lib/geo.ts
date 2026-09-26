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

type FC = FeatureCollection<Polygon | MultiPolygon, DistrictProps>;
const cache: Record<string, FC> = {};

async function loadGeo(name: "sabah" | "malaysia") {
  if (!cache[name]) {
    const file = path.join(process.cwd(), "public", "data", "geo", `${name}.geojson`);
    const fc = JSON.parse(await readFile(file, "utf8")) as FC;
    // d3-geo uses spherical winding (clockwise exterior rings); RFC 7946 GeoJSON is the
    // opposite. A feature whose area exceeds a hemisphere is inside-out: reverse its rings.
    for (const f of fc.features) {
      if (geoArea(f) > 2 * Math.PI) {
        if (f.geometry.type === "Polygon") f.geometry.coordinates.forEach((r) => r.reverse());
        else f.geometry.coordinates.forEach((p) => p.forEach((r) => r.reverse()));
      }
    }
    cache[name] = fc;
  }
  return cache[name];
}

export const sabahGeo = () => loadGeo("sabah");

export interface ProjectedDistrict {
  id: string;
  slug: string;
  name: string;
  division: string | null;
  d: string;
  cx: number;
  cy: number;
  /** Screen-space bounding box [[x0, y0], [x1, y1]], for zooming to a district. */
  bounds: [[number, number], [number, number]];
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
      bounds: pathGen.bounds(f),
    };
  });
  return { width, height, districts };
}

/** Sabah fitted to the viewport, plus neighbouring land (Sarawak, Labuan) drawn as context. */
export async function projectSabahInContext(width: number, height: number, pad = 40) {
  const [fc, my] = await Promise.all([sabahGeo(), loadGeo("malaysia")]);
  const projection = geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], fc);
  const pathGen = geoPath(projection);
  const base = await projectSabah(width, height, pad);
  const near = my.features.filter((f) => f.properties.state === "Sarawak" || f.properties.state === "W.P. Labuan");
  const context = near.map((f) => pathGen(f) ?? "").join("");
  const label = (state: string) => {
    const fs = near.filter((f) => f.properties.state === state);
    const pts = fs.map((f) => projection([f.properties.lon, f.properties.lat]) ?? [0, 0]);
    return pts.length ? { name: state.replace("W.P. ", ""), x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length } : null;
  };
  const labuan = label("W.P. Labuan");
  // Sarawak's label sits where its northern districts meet Sabah, so it stays in view.
  const sarawak = near
    .filter((f) => f.properties.state === "Sarawak")
    .map((f) => projection([f.properties.lon, f.properties.lat]) ?? [0, 0])
    .filter(([x, y]) => x > 0 && y < height)
    .sort((a, b) => b[0] - a[0])[0];
  return {
    ...base,
    context,
    contextLabels: [labuan, sarawak ? { name: "Sarawak", x: sarawak[0], y: sarawak[1] } : null].filter(Boolean) as { name: string; x: number; y: number }[],
  };
}
