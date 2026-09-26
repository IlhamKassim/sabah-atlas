import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    // In Azure, data releases live in Blob Storage; locally they are copied into public/.
    const base = process.env.ATLAS_RELEASES_BASE_URL;
    return base ? [{ source: "/data/releases/:path*", destination: `${base}/:path*` }] : [];
  },
};

export default nextConfig;
