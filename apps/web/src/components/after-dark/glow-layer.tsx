/** Where each district's lights sit and how strong they are (total radiance, one year). */
export interface GlowPoint { id: string; cx: number; cy: number }

/**
 * Night-time light as a soft glow: a blurred gold halo per district, sized by total radiance and
 * centred on its main town, clipped to the coastline. Illustrative at district level; the real
 * satellite image is finer. Draw inside an <svg> after the land.
 */
export function GlowLayer({ uid, land, points, total, scale = 1 }: {
  uid: string;
  land: { id: string; d: string }[];
  points: GlowPoint[];
  total: Record<string, number>;
  /** Current zoom, so the blur stays soft rather than growing with the map. */
  scale?: number;
}) {
  return (
    <>
      <defs>
        <clipPath id={`${uid}-land`}>{land.map((d) => <path key={d.id} d={d.d} />)}</clipPath>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor="#fff2c4" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#f6c85a" stopOpacity="0.7" />
          <stop offset="0.6" stopColor="#c98a2a" stopOpacity="0.22" />
          <stop offset="1" stopColor="#8a5a1a" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={7 / scale} />
        </filter>
      </defs>
      <g clipPath={`url(#${uid}-land)`} style={{ mixBlendMode: "screen" }} pointerEvents="none" aria-hidden>
        <g filter={`url(#${uid}-soft)`}>
          {points.map((p) => (
            <circle key={p.id} cx={p.cx} cy={p.cy} r={5 + 2.3 * Math.sqrt(total[p.id] ?? 0)} fill={`url(#${uid}-glow)`} className="transition-[r] duration-700 ease-out" />
          ))}
        </g>
        {points.map((p) => (
          <circle key={p.id} cx={p.cx} cy={p.cy} r={1 + 0.09 * Math.sqrt(total[p.id] ?? 0)} fill="#fff8e0" opacity={0.9} className="transition-[r] duration-700" />
        ))}
      </g>
    </>
  );
}
