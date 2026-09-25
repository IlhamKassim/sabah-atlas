import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

const serif = IBM_Plex_Serif({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], variable: "--font-plex-serif" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "Atlas Ekonomi Sabah", template: "%s · Atlas Ekonomi Sabah" },
  description:
    "An evidence atlas of Sabah's 27 district economies: official statistics, transparent diagnostics, projections with uncertainty, and a cited AI analyst.",
  openGraph: { siteName: "Atlas Ekonomi Sabah", locale: "en_MY", type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col bg-pasir text-granite">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-kunyit focus:px-3 focus:py-2 focus:text-malam">
          Skip to content
        </a>
        <NuqsAdapter>
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </NuqsAdapter>
      </body>
    </html>
  );
}
