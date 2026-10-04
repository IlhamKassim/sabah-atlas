import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Query-string variants are views of a canonical page: /compare alone has thousands of ?ids= combinations.
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/compare?", "/analyst?", "/explore", "/?"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
