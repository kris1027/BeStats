import { z } from "zod";

// Only web origins: a mistyped `ftp://` would otherwise reach every canonical
// and still count as an indexable deployment.
const siteUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * The origin every absolute SEO URL is built from, or null when
 * `NEXT_PUBLIC_SITE_URL` is missing or invalid (spec 0016, AC-1).
 *
 * It checks only this one variable, on purpose, rather than going through
 * `getPublicEnv()`: that schema also requires the Supabase keys, and a missing
 * auth key must never switch off canonicals and share cards. It never throws,
 * so a missing site URL omits the URL fields instead of failing a page
 * (AC-3). Only the origin is kept, so a pasted path or trailing slash cannot
 * end up inside a canonical.
 */
export function siteUrl(): string | null {
  const parsed = siteUrlSchema.safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  if (!parsed.success) return null;
  return new URL(parsed.data).origin;
}

/**
 * Whether this deployment may be indexed: only Vercel's production deployment
 * with a site URL set (spec 0016, AC-2).
 *
 * Local runs, CI builds and preview deployments all answer false, so a half
 * finished build never competes with the real site in search results.
 * `/robots.txt` and `/sitemap.xml` are prerendered, so this is read when
 * `pnpm build` runs, not per request.
 */
export function isIndexableDeployment(): boolean {
  return process.env.VERCEL_ENV === "production" && siteUrl() !== null;
}
