import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

// Logo system 2a: Bricolage Grotesque for the wordmark and every heading.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-bricolage" });
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "SabahKu · the economic atlas of Sabah's 27 districts", template: "%s · SabahKu" },
  description:
    "SabahKu maps the economies of Sabah's 27 districts: official statistics, transparent diagnostics, projections with uncertainty, and a cited AI analyst.",
  openGraph: { siteName: "SabahKu", locale: "en_MY", type: "website" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a1614" },
    { media: "(prefers-color-scheme: light)", color: "#0a1614" },
  ],
};

// Applied before first paint so a saved light theme never flashes dark.
const THEME_SCRIPT = `try{var t=localStorage.getItem("sabahku-theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-bg text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-kunyit focus:px-3 focus:py-2 focus:text-night">
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
