import { JALUR_GROUPS, JALUR_SHORT, type JalurCell, jalurColor } from "@/lib/jalur";
import { LAUT, MOGAH_LAUT } from "@/lib/scales";

/**
 * Signature visual: a district's jalur — a compact strip of bands, one per indicator,
 * coloured by its percentile within Sabah, grouped welfare / structure / momentum / access / lights
 * and separated by dark rules like the black bands of a mogah sarong.
 */
export function Jalur({
  cells, height = 22, cellWidth = 22, gap = 2, showLabels = false, title,
}: {
  cells: Record<string, JalurCell>;
  height?: number;
  cellWidth?: number;
  gap?: number;
  showLabels?: boolean;
  title?: string;
}) {
  const rule = 4;
  const labelH = showLabels ? 30 : 0;
  if (showLabels) {
    cellWidth = Math.max(cellWidth, 46);
    gap = Math.max(gap, 3);
  }
  let x = 0;
  const parts: React.ReactNode[] = [];
  JALUR_GROUPS.forEach((g, gi) => {
    if (gi > 0) {
      parts.push(<rect key={`r-${g.key}`} x={x + gap / 2} y={labelH} width={rule} height={height} fill="var(--ink)" />);
      x += rule + gap * 2;
    }
    if (showLabels) {
      parts.push(
        <text key={`g-${g.key}`} x={x} y={10} fontSize={9} className="font-mono" fill="var(--mogah)" letterSpacing="0.06em">
          {g.label.toUpperCase()}
        </text>,
      );
    }
    g.codes.forEach((code) => {
      const c = cells[code];
      const fill = c ? jalurColor(c) : "var(--nodata)";
      parts.push(
        <g key={code}>
          <rect x={x} y={labelH} width={cellWidth} height={height} fill={fill} stroke="var(--ink)" strokeOpacity={0.12}>
            <title>
              {`${JALUR_SHORT[code]}: ${c?.pct == null ? "no data" : `${Math.round(c.pct)}th percentile in Sabah`}${c?.period ? ` (${c.period})` : ""}${c?.neutral ? " · descriptive" : ""}`}
            </title>
          </rect>
          {c?.flagged && (
            <circle cx={x + cellWidth - 4} cy={labelH + 4} r={1.8} fill="var(--ink)" />
          )}
          {showLabels && <CellLabel x={x + cellWidth / 2} y={labelH - 5} text={JALUR_SHORT[code]} />}
        </g>,
      );
      x += cellWidth + gap;
    });
  });
  const width = x - gap;
  return (
    <svg
      viewBox={`0 0 ${width} ${height + labelH}`}
      width={showLabels ? undefined : width}
      className={showLabels ? "h-auto w-full max-w-3xl" : "h-auto max-w-full"}
      role="img"
      aria-label={title ?? "District signature strip"}
    >
      {parts}
    </svg>
  );
}

/** Labels longer than a cell wraps onto two lines at the last space ("Lights / growth"). */
function CellLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const cut = text.length > 8 ? text.lastIndexOf(" ") : -1;
  const lines = cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text];
  return (
    <text x={x} y={y} fontSize={8} textAnchor="middle" fill="var(--muted)" className="font-mono">
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? -(lines.length - 1) * 8.5 : 8.5}>{l}</tspan>
      ))}
    </text>
  );
}

export function JalurLegend() {
  const stops = [0, 3, 5, 7, 10].map((i) => MOGAH_LAUT[i]);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[0.66rem] text-muted">
      <span className="flex items-center gap-1.5">
        {stops.map((s) => <span key={s} className="inline-block h-3 w-4" style={{ background: s }} />)}
        <span className="ml-1">worse ← percentile in Sabah → better</span>
      </span>
      <span className="flex items-center gap-1.5">
        {[1, 4, 7, 10].map((i) => LAUT[i]).map((s) => <span key={s} className="inline-block h-3 w-4" style={{ background: s }} />)}
        <span className="ml-1">structure: lower → higher (not good/bad)</span>
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="2" fill="var(--ink)" /></svg> boundary change
      </span>
    </div>
  );
}
