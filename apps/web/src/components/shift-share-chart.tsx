"use client";

import { scaleLinear } from "d3-scale";
import { useState } from "react";

import type { ShiftWindow } from "@/lib/api";
import { SECTOR_LABEL, signed } from "@/lib/format";

import { ChartFrame } from "./chart-frame";

const PARTS = [
  { key: "benchmark_effect", label: "Benchmark growth", color: "var(--faint)" },
  { key: "industry_mix", label: "Industry mix", color: "var(--kunyit)" },
  { key: "competitive", label: "Competitive (own merit)", color: "var(--laut)" },
] as const;

/** Shift-share: splits a district's GDP change into benchmark, industry-mix and competitive effects. */
export function ShiftShareChart({ windows, name }: { windows: ShiftWindow[]; name: string }) {
  const combos = windows.map((w) => `${w.t0}-${w.t1}|${w.benchmark}`);
  const [sel, setSel] = useState(combos.find((c) => c.startsWith("2015-2019|Sabah")) ?? combos[0]);
  const w = windows[combos.indexOf(sel)] ?? windows[0];
  const rowsData = [
    { key: "total", label: "All sectors", v: w.total },
    ...Object.entries(w.sectors).map(([k, v]) => ({ key: k, label: SECTOR_LABEL[k] ?? k, v })),
  ];
  const ext = Math.max(...rowsData.flatMap((r) => [
    Math.abs(r.v.benchmark_effect) + Math.abs(r.v.industry_mix) + Math.abs(r.v.competitive),
  ]), 1);
  const W = 560, rowH = 30, m = { l: 128, r: 70, t: 8 };
  const H = m.t + rowsData.length * rowH + 6;
  const x = scaleLinear().domain([-ext, ext]).range([m.l, W - m.r]);
  const pct = (v: number) => (w.total.start ? (100 * v) / w.total.start : 0);

  return (
    <div>
      <div className="no-print mb-2 flex flex-wrap gap-1">
        {combos.map((c) => {
          const [yrs, bench] = c.split("|");
          return (
            <button key={c} type="button" aria-pressed={sel === c} onClick={() => setSel(c)}
              className={`border px-1.5 py-0.5 text-[0.7rem] ${sel === c ? "border-ink bg-ink text-bg" : "border-line text-muted hover:border-ink"}`}>
              {yrs.replace("-", "–")} vs {bench}
            </button>
          );
        })}
      </div>
      <ChartFrame
        title={`Why did ${name}'s GDP change, ${w.t0}–${w.t1}?`}
        filename={`shift-share-${name.toLowerCase().replace(/\s+/g, "-")}-${w.t0}-${w.t1}-${w.benchmark}`}
        rows={rowsData.map((r) => ({ sector: r.key, start: r.v.start, end: r.v.end, benchmark_effect: r.v.benchmark_effect, industry_mix: r.v.industry_mix, competitive: r.v.competitive, benchmark: w.benchmark, t0: w.t0, t1: w.t1 }))}
        caption={<>RM million, 2015 prices. Benchmark: {w.benchmark} ({signed(100 * w.benchmark_growth, 1, "%")} over the window). The three effects add up exactly to the actual change. Source: DOSM gdp_district_real_supply; offshore oil &amp; gas (Supra) excluded.</>}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Shift-share decomposition by sector">
          <line x1={x(0)} x2={x(0)} y1={m.t - 4} y2={H} stroke="var(--ink)" strokeWidth={1} />
          {rowsData.map((r, i) => {
            const y0 = m.t + i * rowH;
            let pos = 0, neg = 0;
            return (
              <g key={r.key}>
                {i === 1 && <line x1={0} x2={W} y1={y0 - 2} y2={y0 - 2} stroke="var(--line)" />}
                <text x={0} y={y0 + rowH / 2} dy="0.32em" fontSize={11} fontWeight={r.key === "total" ? 600 : 400} fill="var(--ink)">{r.label}</text>
                {PARTS.map((p) => {
                  const v = r.v[p.key];
                  const start = v >= 0 ? pos : neg;
                  const x0 = v >= 0 ? x(start) : x(start + v);
                  if (v >= 0) pos += v; else neg += v;
                  return <rect key={p.key} x={x0} y={y0 + 7} width={Math.abs(x(v) - x(0))} height={rowH - 14} fill={p.color}>
                    <title>{`${p.label}: ${v.toFixed(1)} RM mil`}</title>
                  </rect>;
                })}
                <text x={W - m.r + 6} y={y0 + rowH / 2} dy="0.32em" fontSize={10} className="font-mono" fill={r.v.competitive >= 0 ? "var(--laut)" : "var(--mogah)"}>
                  {r.key === "total" ? signed(pct(r.v.competitive), 1, "% own") : signed(r.v.competitive, 0)}
                </text>
              </g>
            );
          })}
        </svg>
      </ChartFrame>
      <div className="mt-1 flex flex-wrap gap-3 font-mono text-[0.66rem] text-muted">
        {PARTS.map((p) => <span key={p.key} className="flex items-center gap-1"><span className="inline-block h-2.5 w-3" style={{ background: p.color }} />{p.label}</span>)}
      </div>
    </div>
  );
}
