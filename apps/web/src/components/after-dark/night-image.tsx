import type { NightImagery } from "@/lib/lights";

/**
 * NASA's picture of Sabah at night for one year, with a soft bloom under it, clipped to the
 * districts. With `preload`, every year is drawn and only the current one shown, so playing
 * through the years swaps instantly. Draw inside an <svg> after the land.
 */
export function NightImageLayer({ uid, imagery, year, land, preload = false, scale = 1, unit = 1 }: {
  uid: string;
  imagery: NightImagery;
  year: number;
  land: { id: string; d: string }[];
  preload?: boolean;
  scale?: number;
  unit?: number;
}) {
  const shown = imagery.years.includes(year) ? year : imagery.years.at(-1)!;
  const years = preload ? imagery.years : [shown];
  const img = (y: number, extra: object = {}) => (
    <image
      key={y}
      href={`${imagery.base}${y}.png`}
      x={imagery.x}
      y={imagery.y}
      width={imagery.w}
      height={imagery.h}
      preserveAspectRatio="none"
      opacity={y === shown ? 1 : 0}
      style={{ transition: "opacity 400ms" }}
      {...extra}
    />
  );
  return (
    <>
      <defs>
        <clipPath id={`${uid}-land`}>{land.map((d) => <path key={d.id} d={d.d} />)}</clipPath>
        <filter id={`${uid}-bloom`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={(5 * unit) / scale} />
        </filter>
      </defs>
      <g clipPath={`url(#${uid}-land)`} pointerEvents="none" aria-hidden style={{ mixBlendMode: "screen" }}>
        <g filter={`url(#${uid}-bloom)`} opacity={0.9}>{years.map((y) => img(y))}</g>
        <g>{years.map((y) => img(y))}</g>
      </g>
    </>
  );
}
