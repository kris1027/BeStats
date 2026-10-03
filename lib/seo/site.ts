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
 * end up inside a canonical (`lib/seo/AGENTS.md`, Rules).
 */
export function siteUrl(): string | null {
  const parsed = siteUrlSchema.safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  if (!parsed.success) return null;
  return new URL(parsed.data).origin;
}

/**
 * `path` made absolute against `siteUrl()`, or null without a site URL
 * (spec 0016, AC-1, AC-3).
 *
 * The one place a canonical, `og:url`, share card or JSON-LD `url` is built,
 * so every caller leaves the field out the same way when the origin is
 * missing, rather than relying on `metadataBase`, which would fail the build
 * (`lib/seo/AGENTS.md`, Rules).
 */
export function absoluteUrl(path: string): string | null {
  const origin = siteUrl();
  return origin === null ? null : `${origin}${path}`;
}

/**
 * Whether this deployment may be indexed: only Vercel's production deployment
 * with a site URL set (spec 0016, AC-2).
 *
 * Local runs, CI builds and preview deployments all answer false, so a half
 * finished build never competes with the real site in search results.
 * `/robots.txt` and `/sitemap.xml` are prerendered, so this is read when
 * `pnpm build` runs, not per request (`lib/seo/AGENTS.md`, Rules).
 */
export function isIndexableDeployment(): boolean {
  return process.env.VERCEL_ENV === "production" && siteUrl() !== null;
}
