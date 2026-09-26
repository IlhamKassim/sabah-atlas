import { ImageResponse } from "next/og";

import { projectSabah } from "@/lib/geo";
import { DIVISION_HEX } from "@/lib/scales";

export const alt = "SabahKu: the economic atlas of Sabah's 27 districts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The link preview (LinkedIn, WhatsApp, X): Sabah's districts coloured by division.
export default async function Image() {
  const geo = await projectSabah(560, 480, 10);
  const paths = geo.districts
    .map((d) => `<path d="${d.d}" fill="${DIVISION_HEX[d.division ?? ""] ?? "#2a3a36"}" stroke="#0a1614" stroke-width="1.4" stroke-linejoin="round"/>`)
    .join("");
  const map = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="560" height="480" viewBox="0 0 560 480">${paths}</svg>`)}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0a1614", color: "#e6eee8", padding: "56px 40px 56px 64px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 520 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 700, letterSpacing: -2 }}>
              <span>Sabah</span>
              <span style={{ color: "#3cc0b4" }}>Ku</span>
            </div>
            <div style={{ fontSize: 34, lineHeight: 1.25, marginTop: 12 }}>The economic atlas of Sabah&apos;s 27 districts</div>
            <div style={{ fontSize: 22, lineHeight: 1.45, marginTop: 24, color: "#95aaa3" }}>
              Official DOSM statistics, forecasts with honest uncertainty, and an AI analyst that cites every number.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 22, color: "#f2c14e" }}>sabah-ku.com</div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <img src={map} width={560} height={480} alt="" />
        </div>
      </div>
    ),
    size,
  );
}
