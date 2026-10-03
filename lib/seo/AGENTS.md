# lib/seo

How BeStats presents itself to search engines and link previews. Governed by [spec 0016](../../docs/specs/0016-seo-metadata-and-sitemap/index.md).

## Files

- `site.ts`: `siteUrl()` (the http(s) origin from `NEXT_PUBLIC_SITE_URL`, or null), `absoluteUrl()` (that origin plus a path, or null) and `isIndexableDeployment()` (true only with `VERCEL_ENV=production` and a valid site URL).
- `metadata.ts`: `catalogMetadata()` for every public catalog page, `landingMetadata()` for `/movies` and `/shows` (called through `lib/landing-metadata.ts`, which sits outside this folder because it catches `TmdbError`), `shareMetadata()` for the Open Graph and X fields every page shares, `SITE_NAME` and `siteCardUrl()`.
- `json-ld.ts`: `movieJsonLd()`, `showJsonLd()` and `jsonLdScript()`. Rendered by `components/catalog/json-ld.tsx`.
- `sitemap.ts`: `sitemapEntries()` and `DISCOVER_PAGES_PER_TYPE`, the pure half of `app/sitemap.ts`.
- `theme-tokens.ts`: `rootTokens()`, which reads colours from the `:root` block of `app/globals.css` for `app/opengraph-image.tsx`.
- The routes that use them: `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.tsx`.

## Rules

- This folder is pure: no `server-only`, no runtime TMDB import. Pages pass normalized TMDB values in, so tests import these modules directly.
- No SEO surface reads cookies, headers or the session, or imports `lib/supabase/`. `request-scope.test.ts` greps for this. Nothing user specific may reach a share card, the sitemap or robots, and request state would also cost the public pages their prerendered shells.
- `siteUrl()` reads only its one variable, not `getPublicEnv()`, so a missing Supabase key never switches SEO off. It never throws.
- Build every URL (canonical, `og:url`, share image, sitemap entry, JSON-LD `url`) as an absolute string from `siteUrl()`. When it is null, leave the field out. Never rely on `metadataBase` to resolve a relative path, because that fails the build without a site URL.
- A new public page builds its metadata through `catalogMetadata()`, or through `shareMetadata()` when it has no canonical (as `/search` does). Both set `openGraph.images` explicitly every time, because Next merges metadata shallowly and a page that sets `openGraph` otherwise loses the root site card.
- Not found and failed branches are `noindex` with no canonical and no Open Graph. Canonicals are built from the id, never from the request URL, so a query string never reaches them. The only query a canonical may carry is a landing's `?page=N`.
- Leave out any field whose TMDB value is null, empty or zero. Never emit a rating of any kind in metadata or JSON-LD.
- Serialize JSON-LD only through `jsonLdScript()`. It escapes `<`, U+2028 and U+2029, so TMDB text cannot close the script tag. Render it only in a page's found branch.
- `/robots.txt`, `/sitemap.xml` and `/opengraph-image` are prerendered, so `VERCEL_ENV` and `NEXT_PUBLIC_SITE_URL` are read when `pnpm build` runs, not per request. To check the indexable branch locally, build with `VERCEL_ENV=production` and a site URL set.
- The sitemap reads discover pages with the exact calls the landings make, so they share cache entries and every listed title is linked from a public page. Its `cacheLife` is chosen once, after all reads settle: `days` when all succeed, `minutes` when any fail.
- `app/opengraph-image.tsx` holds no colour literal (`design-tokens-boundary.test.ts`). It reads tokens from `globals.css` inside a cached scope, and a missing token fails the build.

_Drafted by /sync from the introducing change, worth a quick human pass._
