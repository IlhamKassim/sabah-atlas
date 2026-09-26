import { scaleLinear } from "d3-scale";

import type { DriverResult } from "@/lib/api";
import { fmt } from "@/lib/format";

import { ChartFrame } from "./chart-frame";

/** Associated factors: signed contributions to the model's expectation for this district. */
export function DriversChart({ result, format, name, betterWhenHigher }: { result: DriverResult; format: string; name: string; betterWhenHigher: boolean }) {
  const items = result.contributions.slice(0, 6);
  const toPct = (s: number) => (result.shap_scale === "log" ? 100 * (Math.exp(s) - 1) : s);
  const vals = items.map((c) => toPct(c.shap));
  const ext = Math.max(...vals.map(Math.abs), 1);
  const W = 520, rowH = 24, m = { l: 176, r: 62, t: 4 };
  const H = m.t + items.length * rowH + 4;
  const x = scaleLinear().domain([-ext, ext]).range([m.l, W - m.r]);
  const unit = result.shap_scale === "log" ? "%" : " pp";
  const good = (v: number) => (betterWhenHigher ? v > 0 : v < 0);

  return (
    <ChartFrame
      filename={`drivers-${name.toLowerCase().replace(/\s+/g, "-")}-${result.label.toLowerCase().replace(/\s+/g, "-")}`}
      rows={items.map((c, i) => ({ feature: c.feature, feature_value: c.value, contribution: vals[i], unit: unit.trim(), model: result.model }))}
      caption={<>How each factor moves the model&apos;s expectation relative to an average district ({result.model === "ridge" ? "ridge regression, exact linear contributions" : "LightGBM, SHAP values"}). Associations, not causes. Cross-validated error ±{fmt(result.cv_mae, format)}.</>}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Factors associated with ${result.label} in ${name}`}>
        <line x1={x(0)} x2={x(0)} y1={0} y2={H} stroke="var(--ink)" />
        {items.map((c, i) => {
          const v = vals[i];
          const y0 = m.t + i * rowH;
          return (
            <g key={c.key}>
              <text x={m.l - 8} y={y0 + rowH / 2} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--ink)">{c.feature}</text>
              <rect x={Math.min(x(0), x(v))} y={y0 + 5} width={Math.abs(x(v) - x(0))} height={rowH - 10} fill={good(v) ? "var(--laut)" : "var(--mogah)"} />
              <text x={W - 2} y={y0 + rowH / 2} dy="0.32em" textAnchor="end" fontSize={9.5} className="font-mono" fill={good(v) ? "var(--laut)" : "var(--mogah)"}>
                {`${v > 0 ? "+" : ""}${v.toFixed(1)}${unit}`}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
