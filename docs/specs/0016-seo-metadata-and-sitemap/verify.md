# Verify: SEO metadata and sitemap · spec 0016 · updated 2026-10-03
_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Tip: metadata streams into the body for ordinary browsers. To read it in the `<head>`, you can send an HTML limited bot user agent, for example `curl -A "facebookexternalhit/1.1"`.

## Commands
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` → all green → AC-24
- [x] `VERCEL_ENV=production NEXT_PUBLIC_SITE_URL=https://bestats.example pnpm build` → route table shows `◐` for `/movies`, `/shows`, `/movies/[id]`, `/shows/[id]`, `/shows/[id]/season/[number]`, `/search`, and `○` for `/robots.txt`, `/sitemap.xml`, `/opengraph-image` → AC-2, AC-24
- [x] Same build, `pnpm start` → `/robots.txt` is exactly `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Disallow: /auth/`, `Sitemap: https://bestats.example/sitemap.xml` → AC-4
- [x] Same build → `/sitemap.xml` lists `/movies`, `/shows`, then about 200 `/movies/{id}`, then about 200 `/shows/{id}`, all absolute, no `lastmod`, no `?`, no `/search`, no `/season/`, no private or auth path → AC-6, AC-7
- [x] `NEXT_PUBLIC_SITE_URL= pnpm build` with `VERCEL_ENV` unset, then `pnpm start` → `/robots.txt` is `User-agent: *` plus `Disallow: /` with no `Sitemap`; `/sitemap.xml` is an empty `urlset` → AC-2, AC-5, AC-9
- [x] Same build → `/movies/550` answers 200 with a TMDB `og:image`, no canonical, no `og:url`; `/movies` has no `og:image` at all → AC-1, AC-3, AC-11
- [x] Start any build with `TMDB_READ_ACCESS_TOKEN=bad` → `/movies/551`, `/shows/1397`, `/shows/1397/season/1` and an uncached `/movies?page=7` carry `noindex`, no canonical, no JSON-LD → AC-8 (landing), AC-15, AC-17

## UI / manual (indexable build, signed out)
- [x] `/movies/550` → canonical `/movies/550`, `og:type` `video.movie`, one `og:image` from `image.tmdb.org/t/p/w1280`, `twitter:card` `summary_large_image`, `og:title` with no ` · BeStats` → AC-10, AC-11, AC-12
- [x] `/movies/550?utm_source=x` → canonical still `/movies/550` → AC-16
- [x] `/movies/550` JSON-LD → `@type` `Movie`, `duration` `PT139M`, 10 actors in billing order, no rating field → AC-21
- [x] `/shows/1396` → canonical, `og:type` `video.tv_show`, backdrop image, `TVSeries` JSON-LD with `endDate` (Ended show) → AC-13, AC-22
- [x] A returning show (any `Returning Series`, for example from `/shows`) → JSON-LD has no `endDate` → AC-22
- [x] `/shows/1396/season/1` → canonical with the season path, `og:type` `website`, the season poster as image, no JSON-LD → AC-14, AC-22
- [x] A season with no poster → falls back to the show backdrop, then poster → AC-14
- [x] `/movies` and `/shows?page=3` → canonical `/movies` and `/shows?page=3`, the AC-17 descriptions, site card image → AC-17
- [x] `/movies?page=abc` and a page past the last one → `noindex`, no canonical → AC-17
- [x] `/search?q=dune` → `noindex, follow`, the AC-18 description, no canonical, site card image → AC-18
- [x] `/movies/999999999` and `/shows/1396/season/99` → `noindex`, no canonical → AC-15
- [x] `/sign-in` → still `noindex, nofollow`, shares as the site card → AC-20, AC-25
- [x] Open `/opengraph-image` → 1200 by 630 PNG, "BeStats" and the tagline on the theme background → AC-19

## Signed in (local stack, `pnpm dev:docker` or a production build against it)
- [x] Signed in, `/robots.txt` and `/sitemap.xml` are byte for byte what a signed out request gets → AC-24
- [x] Signed in, the `<head>` metadata tags of `/movies/550`, `/shows/1396`, `/movies` and `/search` match the signed out ones → AC-24
- [x] Signed in, `/robots.txt`, `/sitemap.xml`, `/opengraph-image` answer 200 with no redirect and no `Set-Cookie` → AC-25
- [x] `/watchlist`, `/account` keep their existing `robots` values → AC-25

## Value sourcing
- [x] Site origin: set `NEXT_PUBLIC_SITE_URL=https://bestats.example/some/path/` → canonicals use `https://bestats.example` only → AC-1
- [x] Indexable flag: `VERCEL_ENV=preview` build with a valid site URL → robots disallows all, sitemap empty → AC-2
- [x] Sitemap ids: the first movie URL equals the first card on `/movies` (same build window) → AC-6
- [x] Sitemap lifetime: route table shows `/sitemap.xml` revalidate `1d` on a healthy build → AC-8
- [x] Movie and show share image: a title with no backdrop uses its `w500` poster → AC-12, AC-13
- [x] Landing page number: `/movies?page=2` canonical `/movies?page=2` → AC-17
- [x] `og:locale` is `en_US` on every public page → AC-10
- [x] Site card colours: change `--background` in `globals.css`, rebuild, the card follows; delete it and the build fails → AC-19

## Acceptance-criteria coverage
- AC-1 site origin steps and `lib/seo/site.test.ts` · AC-2 the three builds and `site.test.ts` · AC-3 no site URL build · AC-4 robots step and `app/robots.test.ts` · AC-5 empty build · AC-6, AC-7, AC-8, AC-9 sitemap steps and `app/sitemap.test.ts` · AC-10, AC-11 title page heads and `lib/seo/metadata.test.ts` · AC-12 to AC-16 title page steps · AC-17, AC-18 landing and search steps · AC-19 card step and `lib/seo/theme-tokens.test.ts` · AC-20 sign in step · AC-21 to AC-23 JSON-LD steps and `lib/seo/json-ld.test.ts` · AC-24 signed in steps, route table, `lib/seo/request-scope.test.ts` · AC-25 signed in steps and `proxy.test.ts`
