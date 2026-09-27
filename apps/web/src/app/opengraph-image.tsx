import { ImageResponse } from "next/og";

import { MARK_RIDGE } from "@/components/logo";
import { ogFonts } from "@/lib/og-fonts";
import { projectSabah } from "@/lib/geo";
import { nightLayers } from "@/lib/lights";
import { nightMapSvg } from "@/lib/night-svg";

export const alt = "SabahKu: the economic atlas of Sabah's 27 districts, drawn at night from satellite night-time lights";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Rebuilt daily from the API; at build time (CI, no API) the map is drawn without the glow.
export const revalidate = 86400;

// The link preview (LinkedIn, WhatsApp, X): Sabah after dark, each district glowing with its night-time light.
export default async function Image() {
  const geo = await projectSabah(600, 510, 12);
  const fonts = await ogFonts();
  const map = `data:image/svg+xml;utf8,${encodeURIComponent(nightMapSvg(geo, ...(await nightLayers(600, 510, 12))))}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "radial-gradient(ellipse at 70% 45%, #0d1a1c 0%, #05090b 70%)", color: "#f3efe6", fontFamily: fonts ? "Plex" : undefined, padding: "56px 24px 56px 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 520 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <svg width={92} height={92} viewBox="0 0 200 200">
                <circle cx="120" cy="32" r="21" fill="#f4b860" fillOpacity="0.18" />
                <circle cx="120" cy="32" r="12" fill="#f4b860" />
                <path d={MARK_RIDGE} fill="none" stroke="#4fa394" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 187 H185" stroke="#3b7c70" strokeWidth="6" strokeLinecap="round" />
              </svg>
              <div style={{ display: "flex", fontSize: 88, fontWeight: 700, letterSpacing: -3, color: "#f3efe6", fontFamily: fonts ? "Bricolage" : undefined }}>
                <span>Sabah</span>
                <span style={{ color: "#f4b860" }}>Ku</span>
              </div>
            </div>
            <div style={{ fontSize: 34, lineHeight: 1.25, marginTop: 12 }}>The economic atlas of Sabah&apos;s 27 districts</div>
            <div style={{ fontSize: 22, lineHeight: 1.45, marginTop: 24, color: "#a9a38f" }}>
              Official statistics, 14 years of satellite night lights, forecasts with honest uncertainty, and an AI analyst that cites every number.
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#f4b860" }}>sabah-ku.com</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <img src={map} width={600} height={510} alt="" />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
