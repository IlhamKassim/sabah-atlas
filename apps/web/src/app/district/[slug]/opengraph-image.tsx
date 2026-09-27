import { ImageResponse } from "next/og";

import { api } from "@/lib/api";
import { fmt, ordinal } from "@/lib/format";
import { projectSabah } from "@/lib/geo";
import { nightLayers } from "@/lib/lights";
import { nightMapSvg } from "@/lib/night-svg";
import { ogFonts } from "@/lib/og-fonts";
import { DIVISION_HEX } from "@/lib/scales";

export const alt = "A SabahKu district card: the district outlined on Sabah at night, with its headline figures";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Each district's link preview: its outline on Sabah at night, and three headline figures.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, geo] = await Promise.all([api.district(slug), projectSabah(560, 480, 12)]);
  const d = p.district;
  const layers = await nightLayers(560, 480, 12, d.id);
  const fonts = await ogFonts();
  const map = `data:image/svg+xml;utf8,${encodeURIComponent(nightMapSvg(geo, ...layers))}`;
  const last = (code: string) => p.indicators[code]?.at(-1);
  const figs = [
    { label: "Median household income", o: last("income_median"), f: "currency" },
    { label: "Absolute poverty", o: last("poverty_absolute"), f: "pct" },
    { label: "Population", o: last("population"), f: "pop" },
  ];
  const color = DIVISION_HEX[d.division ?? ""] ?? "#4fa394";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "radial-gradient(ellipse at 70% 45%, #0d1a1c 0%, #05090b 70%)", color: "#f3efe6", fontFamily: fonts ? "Plex" : undefined, padding: "52px 24px 48px 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 580 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color }}>{d.division} Division · Sabah</div>
            <div style={{ display: "flex", fontSize: 92, fontWeight: 700, letterSpacing: -3, marginTop: 8, lineHeight: 1, fontFamily: fonts ? "Bricolage" : undefined }}>{d.name}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 36, gap: 14 }}>
              {figs.map(({ label, o, f }) => (
                <div key={label} style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 44, color: "#f4b860", whiteSpace: "nowrap" }}>{o ? (f === "pop" ? `${fmt(o.value, "number1")}k` : fmt(o.value, f)) : "—"}</span>
                  <span style={{ fontSize: 22, color: "#a9a38f" }}>{label}{o ? `, ${o.period}` : ""}{o?.rank_sabah ? ` · ${ordinal(o.rank_sabah)} of ${o.n_sabah}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, fontSize: 24 }}>
            <span style={{ display: "flex", fontWeight: 700, fontFamily: fonts ? "Bricolage" : undefined }}>Sabah<span style={{ color: "#f4b860" }}>Ku</span></span>
            <span style={{ color: "#f4b860" }}>sabah-ku.com/district/{d.slug}</span>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <img src={map} width={560} height={480} alt="" />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
