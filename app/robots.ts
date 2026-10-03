import type { MetadataRoute } from "next";

import { isIndexableDeployment, siteUrl } from "@/lib/seo/site";

/**
 * `/robots.txt` (spec 0016, AC-4, AC-5).
 *
 * Production allows everything except the Route Handlers and the auth
 * callbacks. Private and sign in pages are deliberately not disallowed: a
 * crawler that cannot fetch them never sees the `noindex` they carry, and a
 * disallowed URL can still be indexed from links. Every other deployment
 * shuts crawlers out entirely. Prerendered, so the build decides.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteUrl();
  if (!isIndexableDeployment() || origin === null) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: `${origin}/sitemap.xml`,
  };
}
