import { fmt } from "@/lib/format";
import { MOGAH_LAUT } from "@/lib/scales";

export function MapLegend({
  directional, direction, min, max, format, steps, breaks,
}: {
  directional: boolean;
  direction: "up" | "down" | "neutral";
  min: number;
  max: number;
  format: string;
  steps: string[];
  /** Class boundaries between `steps` (length steps.length - 1), for quantile maps. */
  breaks?: number[];
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
  if (breaks?.length === steps.length - 1) {
    const edges = [min, ...breaks, max];
    return (
      <div>
        <p className="kicker text-muted">Colour</p>
        <ul className="mt-1 space-y-0.5 font-mono text-[0.66rem] text-muted">
          {steps.map((c, i) => (
            <li key={c} className="flex items-center gap-2">
              <span className="inline-block h-3 w-5" style={{ background: c }} aria-hidden />
              {fmt(edges[i], format)} – {fmt(edges[i + 1], format)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Descriptive indicator: darker means higher, not better or worse. Classes hold roughly equal numbers of districts.</p>
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
