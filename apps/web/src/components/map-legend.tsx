import { fmt } from "@/lib/format";
import { MOGAH_LAUT } from "@/lib/scales";

export function MapLegend({
  directional, direction, min, max, format, steps,
}: {
  directional: boolean;
  direction: "up" | "down" | "neutral";
  min: number;
  max: number;
  format: string;
  steps: string[];
}) {
  if (directional) {
    return (
      <div>
        <p className="kicker text-muted">Colour</p>
        <div className="mt-1 flex">
          {MOGAH_LAUT.map((c) => <span key={c} className="h-3 flex-1" style={{ background: c }} />)}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-muted">
          <span>worst in Sabah</span>
          <span>best</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Coloured by percentile within Sabah. {direction === "down" ? "Lower values are better for this indicator, so the scale is inverted: teal always means better." : "Higher values are better."}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="kicker text-muted">Colour</p>
      <div className="mt-1 flex">
        {steps.map((c) => <span key={c} className="h-3 flex-1" style={{ background: c }} />)}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.62rem] text-muted">
        <span>{fmt(min, format)}</span>
        <span>{fmt(max, format)}</span>
      </div>
      <p className="mt-2 text-xs text-muted">Descriptive indicator: darker means higher, not better or worse.</p>
    </div>
  );
}
