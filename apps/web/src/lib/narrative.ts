import type { Indicator, ScoreItem } from "./api";
import { fmt } from "./format";

/** Sober, specific sentence for a scorecard item. Never "failing"; always the evidence. */
export function scoreSentence(item: ScoreItem, ind: Indicator): string {
  const value = fmt(item.value, ind.format);
  const peers = item.peer_median != null ? fmt(item.peer_median, ind.format) : null;
  const isMomentum = ind.category === "momentum";
  const higherBetter = ind.direction !== "down";

  let level = "";
  if (item.level === "not_comparable") {
    level = "cannot be compared across the boundary change";
  } else if (peers && item.gap != null) {
    const g = Math.abs(item.gap);
    const amount = item.gap_unit === "%" ? `${g.toFixed(0)}%` : isMomentum ? `${g.toFixed(1)} pp/yr` : `${g.toFixed(item.gap_unit.includes("index") ? 3 : 1)} ${ind.format === "pct" ? "pp" : ""}`.trim();
    const aboveInRaw = (item.level === "above") === higherBetter;
    if (item.level === "in_line") level = `is in line with its structural peers (${peers})`;
    else level = `is ${amount} ${aboveInRaw ? "above" : "below"} its structural peers (${peers})${item.level === "above" ? "" : ""}`;
  }

  let trend = "";
  if (item.trend_window && item.trend !== "n/a") {
    const [a, b] = item.trend_window;
    if (item.trend === "not_comparable") trend = `; the ${a}–${b} change is not comparable because of a boundary change`;
    else if (ind.format === "currency" && item.trend_per_year != null) {
      const t = Math.abs(item.trend_per_year).toFixed(1);
      trend = item.trend === "flat" ? `, growing roughly in step with Sabah (${a}–${b})` : `, growing ${t} pp/yr ${item.trend_per_year > 0 ? "faster" : "slower"} than Sabah (${a}–${b})`;
    } else if (item.trend_per_year != null) {
      trend = item.trend === "flat" ? `, broadly unchanged ${a}–${b}` : `, ${item.trend} since ${a}`;
    }
  }
  return `${ind.short} of ${value} (${item.period}) ${level}${trend}.`;
}

export const VERDICT_LABEL: Record<string, string> = {
  strength: "Strength",
  concern: "Concern",
  mixed: "Mixed",
  in_line: "In line",
  not_comparable: "Not comparable",
  unknown: "Insufficient data",
};
