import type { ScaleQuantile } from "d3-scale";

import { fmt } from "@/lib/format";
import { MOGAH_LAUT, NIGHT_FILL_OPACITY } from "@/lib/scales";

/** `night`: the map is drawn at night (fills at 55% over near-black), so the swatches are too. */
export function Legend({ directional, direction, seq, format, night = false }: { directional: boolean; direction: string; seq: ScaleQuantile<string>; format: string; night?: boolean }) {
  return (
    <div className="shrink-0 rounded-lg border border-line bg-panel/90 px-3 py-2 backdrop-blur sm:w-56">
      {directional ? (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-sm">
            {MOGAH_LAUT.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[0.6rem] text-muted"><span>worst in Sabah</span><span>best</span></div>
          <p className="mt-1 hidden text-[0.64rem] leading-snug text-faint sm:block">
            Percentile within Sabah that year. {direction === "down" ? "Lower is better here, so teal still means better." : "Higher is better."}
          </p>
        </>
      ) : (
        <>
          <div className={`flex h-2.5 overflow-hidden rounded-sm ${night ? "bg-[#05090b]" : ""}`}>
            {seq.range().map((c) => <span key={c} className="flex-1" style={{ background: c, opacity: night ? NIGHT_FILL_OPACITY : 1 }} />)}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[0.6rem] text-muted">
            <span>{fmt(seq.domain()[0], format)}</span><span>{fmt(seq.domain().at(-1)!, format)}</span>
          </div>
          <p className="mt-1 hidden text-[0.64rem] leading-snug text-faint sm:block">
            {night
              ? "Brighter means more light; the glow grows with each district's total light. Same classes every year."
              : "Descriptive: darker means higher, not better or worse. Same classes every year."}
          </p>
        </>
      )}
    </div>
  );
}
