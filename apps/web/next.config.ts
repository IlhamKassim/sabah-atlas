import type { NextConfig } from "next";

// The site is exported as static files (out/) and served by Cloudflare. Pages are rendered at build
// time from the API; security headers and noindex rules live in public/_headers, since a static
// export cannot set headers itself.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: false,
  images: { unoptimized: true },
};

export default nextConfig;
