import type { NextConfig } from "next";

// Public host, e.g. sabah-ku.com. Any other host serving the app (the Container Apps URL) is kept out of search indexes.
const SITE_HOST = process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : null;

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...(SITE_HOST && !SITE_HOST.startsWith("localhost")
        ? [{ source: "/:path*", missing: [{ type: "host" as const, value: SITE_HOST.replace(/\./g, "\\.") }], headers: [{ key: "X-Robots-Tag", value: "noindex" }] }]
        : []),
    ];
  },
  async rewrites() {
    // In Azure, data releases live in Blob Storage; locally they are copied into public/.
    const base = process.env.ATLAS_RELEASES_BASE_URL;
    return base ? [{ source: "/data/releases/:path*", destination: `${base}/:path*` }] : [];
  },
};

export default nextConfig;
