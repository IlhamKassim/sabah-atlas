import "server-only";

import { api, publicApiUrl } from "./api";
import { projectBox } from "./geo";

/** The yearly pictures of Sabah at night, placed on a map of the given fit. */
export interface NightImagery {
  /** Browser URL of one year's picture: base + year + ".png". */
  base: string;
  years: number[];
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Null when the API has no pictures loaded; maps then fall back to the drawn glow. */
export async function nightImagery(width: number, height: number, pad: number): Promise<NightImagery | null> {
  const idx = await api.lights().catch(() => null);
  if (!idx?.years.length) return null;
  return { base: `${publicApiUrl}/v1/lights/`, years: idx.years, ...(await projectBox(width, height, pad, idx.bounds)) };
}

/** One year's picture as a data URI, for images rendered on the server (link previews). */
export async function nightPngDataUri(year: number): Promise<string | null> {
  const api = process.env.ATLAS_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${api}/v1/lights/${year}.png`, { next: { revalidate: 86400 } }).catch(() => null);
  if (!res?.ok) return null;
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

/** For link previews: glow totals and, when the API has it, NASA's latest picture placed on
 *  a projectSabah fit. Spread into nightMapSvg(geo, ...layers). */
export async function nightLayers(width: number, height: number, pad: number, highlight?: string) {
  const [lights, idx] = await Promise.all([api.indicator("ntl_radiance_total").catch(() => null), api.lights().catch(() => null)]);
  const total = Object.fromEntries((lights?.values ?? []).map((v) => [v.district_id, v.value]));
  const year = idx?.years.at(-1);
  const href = year ? await nightPngDataUri(year) : null;
  const picture = href && idx ? { href, ...(await projectBox(width, height, pad, idx.bounds)) } : null;
  return [total, highlight, picture] as const;
}
