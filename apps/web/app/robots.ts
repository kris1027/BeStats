import type { MetadataRoute } from "next";

/**
 * `/robots.txt` (spec 0016, AC-5; prompts/web-off-keep-api.md).
 *
 * Every deployment, production included, shuts crawlers out and names no
 * sitemap. Since 2026-11-21 the website is off: a Vercel Firewall rule answers
 * `403` to every page except `/api/`, `/privacy`, `/terms` and this file, so
 * crawler renders can no longer spend the Hobby plan's Active CPU
 * (docs/deploy.md, section 5) while `/api/v1` keeps serving the mobile app.
 * This file stays reachable so crawlers read the disallow and stop asking.
 * Reopening the website restores the production branch from git history
 * together with `CRAWL_BUDGET_DISALLOW` (`lib/seo/crawl.ts`).
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
