# Review, feat/seo-metadata-and-sitemap, 2026-10-03

**Reviewed by**: Sonnet 5.5 (author on Sonnet 5.5)
**Scope**: 37 files, branch vs main (all uncommitted)
**Verdict**: Approve with nits

## Summary
Adds canonical links, share cards, JSON-LD, robots.txt, a 402-URL sitemap and an opengraph-image, all through small pure helpers in `lib/seo/`, and excludes the three metadata routes from the proxy matcher. The change matches spec 0016 closely. Private routes carry `noindex` and are not listed in the sitemap. JSON-LD is escaped and rendered only in found branches. No SEO surface reads request state. No blockers or majors; a few small robustness points.

## Minor
### 🟡 `siteUrl()` accepts any URL scheme, `lib/seo/site.ts:17`
**Problem**: `z.url()` plus `origin !== "null"` lets through `ftp://host` or `ws://host`; only opaque-origin schemes are rejected.
**Why it matters**: A mistyped production variable yields canonicals and a sitemap with a non-http origin, and the deployment is still treated as indexable.
**Suggested fix**: Require `http:` or `https:` (for example `z.url({ protocol: /^https?$/ })`) and add a test case.

### 🟡 Search page Open Graph has no title or description, `app/search/page.tsx:36`
**Problem**: The explicit `openGraph` and `twitter` objects replace the root defaults shallowly and set no `title` or `description`.
**Why it matters**: Share previews of `/search` may fall back inconsistently between platforms. Low impact, since the page is noindex.
**Suggested fix**: Reuse `catalogMetadata` fields, or pass title and description into the objects.

### 🟡 Sitemap lifetime when TMDB is down at build time, `app/sitemap.ts:59`
**Problem**: A build-time TMDB outage prerenders a partial sitemap with a `minutes` lifetime. This is intended, but the prerendered file is only corrected once the first revalidation happens after deploy.
**Why it matters**: Crawlers could fetch a short sitemap right after a bad deploy.
**Suggested fix**: Note it in the deploy checklist (feature 20), or confirm in verify that the route revalidates on the short lifetime.

## Nits
- ⚪ `components/catalog/json-ld.tsx:11`, the `data` prop is `Record<string, unknown>`; exporting a `JsonLd` type from `lib/seo/json-ld.ts` would share it.
- ⚪ `app/layout.tsx:28`, `siteUrl()` and `siteCardUrl()` run at module scope. Fine today, but they will not follow a runtime env change.

## Strengths
- `jsonLdScript` escapes `<`, U+2028 and U+2029, and it is tested with a `</script>` payload.
- Not found and failed branches are `noindex` with no canonical or Open Graph, and the canonical is built from the id alone, so query strings never reach it.
- The sitemap settles its 20 reads independently, rethrows non-`TmdbError` rejections, picks `cacheLife` once after all reads settle, and returns plain ids from the cached scope.
- The deployment gate (`VERCEL_ENV` plus a valid site URL) keeps previews out of search and makes no TMDB calls.
- The proxy matcher change is tested, including near-miss paths that must still run the proxy.
- The no-request-state grep test guards the privacy boundary.

## Test coverage
Every new module and every changed `generateMetadata` has a colocated test (site, metadata, json-ld, sitemap, theme-tokens, robots, sitemap route, pages, proxy matcher, request-scope grep). Failure branches (TmdbError, invalid page, not found) are covered. verify.md records live checks of the built output. No meaningful untested logic found.
