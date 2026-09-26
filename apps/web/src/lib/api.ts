// Typed client for the Atlas read API (apps/api). Server-side only.
import "server-only";

const API = process.env.ATLAS_API_URL ?? "http://localhost:8000";

export type Direction = "up" | "down" | "neutral";

export interface Indicator {
  code: string;
  label: string;
  short: string;
  unit: string;
  format: string;
  direction: Direction;
  category: string;
  jalur: string | null;
  source: string;
  description: string;
  periods?: number[];
}

export interface Source {
  id: string;
  publisher: string;
  dataset_id: string;
  title: string;
  url: string;
  download_url: string | null;
  licence: string;
  last_updated: string | null;
  data_as_of: string | null;
  retrieved_at: string | null;
  caveat: string | null;
}

export interface Release {
  version: string;
  content_hash: string;
  created_at: string;
  manifest: {
    version: string;
    content_hash: string;
    created: string;
    licence: string;
    model_versions: string[];
    files: { file: string; bytes: number; sha256: string; rows?: number }[];
  };
}

export interface District {
  id: string;
  slug: string;
  name: string;
  state: string;
  division: string | null;
  kind: "district" | "successor" | "supra";
  parent_id: string | null;
  first_period: string | null;
  note: string | null;
  area_km2: number | null;
  lon: number | null;
  lat: number | null;
  headline?: Record<string, { value: number; period: number; pct_sabah: number | null }>;
  cluster?: string | null;
}

export interface Obs {
  period: number;
  value: number;
  quality_flag: string | null;
  rank_sabah: number | null;
  n_sabah: number | null;
  pct_sabah: number | null;
  pct_national: number | null;
  source_id: string;
  is_modelled: boolean;
}

export interface IndicatorValue extends Obs {
  district_id: string;
  slug: string;
  name: string;
  division: string | null;
}

export interface ScoreItem {
  indicator: string;
  period: number;
  value: number;
  peer_median: number | null;
  peer_values: Record<string, number>;
  gap: number | null;
  gap_unit: string;
  level: string;
  trend: string;
  trend_per_year: number | null;
  trend_window: [number, number] | null;
  verdict: "strength" | "concern" | "mixed" | "in_line" | "not_comparable" | "unknown";
  source_id: string;
  pct_sabah: number | null;
  rank_sabah: number | null;
  n_sabah: number | null;
  flags: string[];
}

export interface FanPoint { period: number; p10: number; p50: number; p90: number }
export interface ForecastSeries {
  unit: string;
  official: { period: number; value: number }[];
  nowcast: FanPoint[];
  projection: Record<string, FanPoint[]>;
  backtest: { abs_pct_error_by_h: Record<string, number> };
  notes?: string[];
}

export interface ShiftWindow {
  t0: number;
  t1: number;
  label: string;
  benchmark: "Sabah" | "Malaysia";
  benchmark_growth: number;
  sectors: Record<string, { start: number; end: number; benchmark_effect: number; industry_mix: number;
    competitive: number; district_growth: number | null; benchmark_sector_growth: number }>;
  total: { start: number; end: number; change: number; benchmark_effect: number; industry_mix: number;
    competitive: number };
}

export interface Contribution { feature: string; key: string; shap: number; value: number | null }
export interface DriverResult {
  round: number;
  actual: number;
  expected: number;
  residual: number;
  cv_mae: number;
  reading: string;
  base_value: number;
  model: "ridge" | "lightgbm";
  shap_scale: "log" | "pp";
  contributions: Contribution[];
  label: string;
}

export interface Peer { district_id: string; distance: number; cluster: string }
export interface Analytics {
  typology?: {
    cluster_id: number;
    cluster: string;
    peers: Peer[];
    positive_deviant: null | {
      district_id: string;
      improvement: number;
      own_improvement: number;
      differences: { feature: string; z_diff: number; peer_value: number; own_value: number; key: string }[];
    };
    imputed: string[];
    model_version: string;
  };
  scorecard?: { items: ScoreItem[]; peers: string[]; summary: Record<string, number>; model_version: string };
  shift_share?: { windows: ShiftWindow[]; suppressed: string[]; model_version: string };
  drivers?: Record<string, DriverResult> & { model_version?: string };
  forecast?: { indicators: Record<string, ForecastSeries>; model_version: string };
}

export interface Profile {
  district: District;
  children: District[];
  indicators: Record<string, Obs[]>;
  gdp_sectors: { period: number; sector: string; value: number | null }[];
  analytics: Analytics;
  sources: Source[];
}

export interface Meta {
  release: Release | null;
  indicators: Indicator[];
  sources: Source[];
  errata: { source_id: string; district_id: string; period: number; indicator?: string; found: string; reason: string }[];
}

export interface BriefSummary { id: string; district_id: string; slug: string; name: string; division: string; status: "draft" | "reviewed" | "rejected"; reviewer: string | null; reviewed_at: string | null; created_at: string; model_version: string; citation_validity: number | null }
export interface Brief extends BriefSummary { body_md: string; citations: import("@/components/cited-markdown").Citation[]; validation: { citations_total: number; citations_valid: number; citation_validity: number; stripped: { sentence: string; reason: string }[] }; release: string; review_note: string | null }
export interface EvalReport {
  run_at: string; model: string; judge: string; release: string; questions: number; citation_validity: number | null; citations: number;
  target_validity: number; meets_target: boolean; factual_checks: number | null; usefulness_mean: number | null; sentences_stripped: number;
  median_latency_ms: number; errors: number; by_category: Record<string, { n: number; checks_passed: number; checks_total: number }>;
  results: { id: string; category: string; question: string; checks_passed: number; checks_total: number; citations_total: number; citations_valid: number; usefulness: number | null; error: string | null }[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function get<T>(path: string, revalidate = 300): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    next: { revalidate: process.env.NODE_ENV === "development" ? 0 : revalidate },
  });
  if (!res.ok) throw new ApiError(res.status, `${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/v1/meta"),
  districts: (scope: "sabah" | "national" = "sabah") => get<District[]>(`/v1/districts?scope=${scope}`),
  district: (key: string) => get<Profile>(`/v1/districts/${encodeURIComponent(key)}`),
  indicator: (code: string, period?: number, scope: "sabah" | "national" = "sabah") =>
    get<{ indicator: Indicator; period: number; periods: number[]; values: IndicatorValue[]; sources: Source[] }>(
      `/v1/indicators/${code}?scope=${scope}${period ? `&period=${period}` : ""}`,
    ),
  compare: (ids: string[]) =>
    get<{ districts: District[]; series: Record<string, Record<string, Obs[]>>; analytics: Record<string, Analytics> }>(
      `/v1/compare?ids=${ids.map(encodeURIComponent).join(",")}`,
    ),
  analytics: <K extends keyof Analytics>(kind: K) =>
    get<{ district_id: string; slug: string; name: string; division: string; payload: NonNullable<Analytics[K]>; model_version: string }[]>(
      `/v1/analytics/${kind}`,
    ),
  analystStatus: () => get<{ available: boolean; model?: string; reason?: string }>("/v1/analyst/status", 60),
  briefs: () => get<BriefSummary[]>("/v1/briefs", 60),
  brief: (key: string) => get<Brief>(`/v1/briefs/${encodeURIComponent(key)}`, 60),
  analystEval: () => get<EvalReport>("/v1/analyst/eval", 300),
  modelCards: () => get<Record<string, unknown>[]>("/v1/model-cards", 3600),
};

export const publicApiUrl = process.env.NEXT_PUBLIC_ATLAS_API_URL ?? API;
