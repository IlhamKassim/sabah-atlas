import type { ProjectedDistrict } from "./geo";

/**
 * Sabah at night as a standalone SVG string, for link-preview images (next/og renders it as an <img>).
 * Same recipe as the map's night style: dark land, a blurred gold glow per district sized by total
 * night-time light, a bright core at the main town. `highlight` outlines one district in gold.
 */
export function nightMapSvg(
  geo: { width: number; height: number; districts: ProjectedDistrict[] },
  total: Record<string, number>,
  highlight?: string,
  /** NASA's picture of Sabah at night (a data URI and its place on the map): replaces the drawn glow. */
  picture?: { href: string; x: number; y: number; w: number; h: number } | null,
) {
  const { width: W, height: H, districts } = geo;
  const land = districts.map((d) => `<path d="${d.d}"/>`).join("");
  const r = (id: string) => 4 + 3 * Math.sqrt(total[id] ?? 0) * (W / 1000);
  const glows = districts.map((d) => `<circle cx="${d.cx.toFixed(1)}" cy="${d.cy.toFixed(1)}" r="${r(d.id).toFixed(1)}" fill="url(#g)"/>`).join("");
  const cores = districts
    .filter((d) => total[d.id])
    .map((d) => `<circle cx="${d.cx.toFixed(1)}" cy="${d.cy.toFixed(1)}" r="${(0.8 + 0.08 * Math.sqrt(total[d.id]) * (W / 1000)).toFixed(1)}" fill="#fff8e0"/>`)
    .join("");
  const hl = districts.find((d) => d.id === highlight);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
<clipPath id="land">${land}</clipPath>
<radialGradient id="g"><stop offset="0" stop-color="#fff2c4" stop-opacity="0.95"/><stop offset="0.25" stop-color="#f6c85a" stop-opacity="0.7"/><stop offset="0.6" stop-color="#c98a2a" stop-opacity="0.22"/><stop offset="1" stop-color="#8a5a1a" stop-opacity="0"/></radialGradient>
<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(4 * W) / 600}"/></filter>
</defs>
<g fill="#16211e" stroke="#05090b" stroke-width="0.8" stroke-linejoin="round">${land}</g>
${picture
    ? `<g clip-path="url(#land)"><image href="${picture.href}" x="${picture.x}" y="${picture.y}" width="${picture.w}" height="${picture.h}" preserveAspectRatio="none" filter="url(#b)" opacity="0.9"/><image href="${picture.href}" x="${picture.x}" y="${picture.y}" width="${picture.w}" height="${picture.h}" preserveAspectRatio="none"/></g>`
    : `<g clip-path="url(#land)"><g filter="url(#b)">${glows}</g>${cores}</g>`}
${hl ? `<path d="${hl.d}" fill="none" stroke="#f4b860" stroke-width="2.4" stroke-linejoin="round"/>` : ""}
</svg>`;
}
