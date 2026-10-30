// URLs the browser fetches. In development they point at the live API (NEXT_PUBLIC_ATLAS_API_URL);
// in the static build that variable is unset and they point at the JSON files that
// `atlas-snapshot` writes into public/api, which mirror the API's GET endpoints.

const LIVE = process.env.NEXT_PUBLIC_ATLAS_API_URL || null;

/** Base for paths that are the same in both modes (CSV exports, night-light pictures). */
export const publicApiBase = LIVE ?? "/api";

export const publicApi = {
  live: LIVE != null,
  indicator: (code: string, period?: number) =>
    LIVE ? `${LIVE}/v1/indicators/${code}${period ? `?period=${period}` : ""}` : `/api/v1/indicators/${code}${period ? `/${period}` : ""}.json`,
  /** One district's share of /v1/compare; the browser merges up to four. */
  compare: (slug: string) => (LIVE ? `${LIVE}/v1/compare?ids=${encodeURIComponent(slug)}` : `/api/v1/compare/${slug}.json`),
  csv: (slug: string) => `${publicApiBase}/v1/export/${slug}.csv`,
  lights: `${publicApiBase}/v1/lights/`,
};

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}
