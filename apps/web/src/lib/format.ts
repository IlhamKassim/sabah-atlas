import { format as d3format } from "d3-format";

export type Fmt = "currency" | "pct" | "decimal3" | "number0" | "number1" | string;

const rm0 = d3format(",.0f");
const n1 = d3format(",.1f");

export function fmt(value: number | null | undefined, kind: Fmt, opts: { unit?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return "—";
  switch (kind) {
    case "currency":
      return `RM ${rm0(value)}`;
    case "pct":
      return `${n1(value)}${opts.unit === false ? "" : "%"}`;
    case "decimal3":
      return value.toFixed(3);
    case "number0":
      return rm0(value);
    case "number1":
      return n1(value);
    default:
      return n1(value);
  }
}

export function fmtCompact(value: number, kind: Fmt): string {
  if (kind === "currency" && Math.abs(value) >= 10000) return `RM ${(value / 1000).toFixed(1)}k`;
  return fmt(value, kind);
}

export function signed(value: number, digits = 1, suffix = ""): string {
  const s = value.toFixed(digits);
  return `${value > 0 ? "+" : value < 0 ? "−" : "±"}${s.replace("-", "")}${suffix}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const SECTOR_LABEL: Record<string, string> = {
  agriculture: "Agriculture",
  mining: "Mining & quarrying",
  manufacturing: "Manufacturing",
  construction: "Construction",
  services: "Services",
};

/** Human-readable explanation of a quality flag. */
export function explainFlag(flag: string): string {
  const parts = flag.split(";").map((p) => p.trim()).filter(Boolean);
  return parts
    .map((p) => {
      if (p.startsWith("boundary_break:")) return `Boundary change — ${p.slice(15)}`;
      if (p.startsWith("suppressed:")) return `DOSM suppresses values ${p.slice(11)}`;
      if (p.startsWith("window:")) return `Growth window ${p.slice(7).replace("-", "–")}`;
      if (p.startsWith("note:")) return p.slice(5);
      return p;
    })
    .join(" · ");
}
