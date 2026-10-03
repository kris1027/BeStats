# 0016. SEO metadata and sitemap: canonical links, share cards, structured data, robots and a popular titles sitemap

**Date**: 2026-10-03
**Status**: Accepted

Scope feature: [17. SEO metadata and sitemap](../../scope/scope.md) · Beta tier

## Summary

This finishes how BeStats presents itself to search engines and to link previews. Every public catalog page gets a canonical link (the one official address of the page), a share card that uses the TMDB backdrop or poster, and the movie and show pages get structured data (a small block of facts search engines read). A `robots.txt` and a `sitemap.xml` are added: the sitemap lists the two landing pages plus the 200 most popular movies and 200 most popular shows, rebuilt daily. Preview deployments and local runs tell crawlers to stay out, and nothing here reads the session, so the public pages keep their prerendered shells and no private data can leak into a card or the sitemap.

## Requirements

**User stories**:
- As someone who shares a BeStats link, I want the preview to show the title, a short description and the title's artwork, so that the link looks like what it opens.
- As a search engine, I want one canonical address per page, a sitemap of real public pages and clear robots rules, so that I index the catalog and nothing private.
- As the owner, I want preview deployments kept out of search results, so that half finished builds never compete with the real site.

**Acceptance criteria** (the contract):

*Site origin and deployment*

- **AC-1**: `siteUrl()` in `lib/seo/site.ts` parses only `NEXT_PUBLIC_SITE_URL` with its own `z.url()` check (it does not reuse the combined schema in `lib/env.ts`, which also requires the Supabase keys) and returns `new URL(value).origin`, so any path or trailing slash is dropped, or `null` when the value is missing or invalid. It never throws, so a missing Supabase key never disables SEO and a missing site URL never breaks a page.
- **AC-2**: `isIndexableDeployment()` in the same file is true only when `process.env.VERCEL_ENV === "production"` and `siteUrl()` is not null. Local `pnpm dev`, local `pnpm start`, CI builds and Vercel preview builds are all not indexable. Because `/robots.txt` and `/sitemap.xml` are prerendered, both variables are read when `pnpm build` runs, not per request: a build decides its own deployment's robots and sitemap, and a verify build must export both before building.
- **AC-3**: The root layout sets `metadataBase` from `siteUrl()` when it is not null, and leaves it unset otherwise. Every URL this spec emits (canonical, `og:url`, share image, sitemap entry, JSON-LD `url`) is built as an absolute string by the helpers below, never as a relative path left to `metadataBase`, so a missing site URL omits those fields instead of failing the build. With `NEXT_PUBLIC_SITE_URL` unset, every public page still renders and answers 200; it simply carries no canonical, no `og:url` and no site card image.

*robots.txt*

- **AC-4**: On an indexable deployment, `/robots.txt` answers exactly: `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Disallow: /auth/`, and `Sitemap: {siteUrl}/sitemap.xml`. Private and sign in pages are deliberately not disallowed, so crawlers can read the `noindex` they already carry.
- **AC-5**: On a deployment that is not indexable, `/robots.txt` answers `User-agent: *` and `Disallow: /`, with no `Sitemap` line.

*sitemap.xml*

- **AC-6**: On an indexable deployment, `/sitemap.xml` is a valid sitemap of absolute URLs, in this order: `/movies`, `/shows`, then `/movies/{id}` for every movie on `discoverMovies({ page })` pages 1 to 10, then `/shows/{id}` for every show on `discoverTvShows({ page })` pages 1 to 10, each in page order then result order. These are the same calls, with the same default options and popularity order, that the `/movies` and `/shows` landings make, so every listed title is linked from a public page. The sitemap relies on the discover module's existing adult exclusion and does no filtering of its own. Ids are deduplicated within each media type (first occurrence wins), so the file holds at most 402 URLs. An empty page, or a page past TMDB's `totalPages`, simply adds no ids. Entries carry no `lastModified`, `changeFrequency` or `priority`.
- **AC-7**: The sitemap never lists `/search`, a season page, a `?page=` variant, `/showcase`, any private path (`/watchlist`, `/watched`, `/upcoming`, `/account`), any auth path, or any `/api/` or `/auth/` URL.
- **AC-8**: The 20 TMDB page reads run together through `Promise.allSettled` inside one `use cache` function. A read rejected with a `TmdbError` drops only that page's ids; the file still answers 200 with the landings and every id that did load. Any other rejection is rethrown, as `MoviesPage` does, because it is a bug rather than an outage. After all 20 settle, one `if`/`else` calls `cacheLife` exactly once: `"days"` when all 20 succeeded, `"minutes"` when any failed, so a full list returns soon after TMDB recovers. The sitemap's own entry is what lives a day. The inner discover entries keep their own `minutes` lifetime, so the sitemap reuses a landing's TMDB response only when both run within about an hour.
- **AC-9**: On a deployment that is not indexable, `/sitemap.xml` returns `[]`, which renders as a valid, empty `urlset` (confirmed in the built output), and makes no TMDB request.

*Shared page metadata*

- **AC-10**: One helper, `catalogMetadata()` in `lib/seo/metadata.ts`, builds the metadata of every public catalog page from `{ title: string; description: string | undefined; path: string; image: string | null; ogType: "website" | "video.movie" | "video.tv_show" }`. It returns: the top level `title` (the raw title, which the root template turns into `{title} · BeStats` in the tab); `alternates.canonical` as `{siteUrl}{path}`; `openGraph` with `title` (the same raw title, no suffix), `description`, `url` (same as canonical), `siteName: "BeStats"`, `locale: "en_US"`, `type: ogType` and `images`; and `twitter` with `card: "summary_large_image"`, `title` (the raw title), `description` and `images`. `images` is the given TMDB image URL when there is one, otherwise the site card (`{siteUrl}/opengraph-image`, the path Next.js serves for a root `app/opengraph-image.tsx`). With `siteUrl()` null it omits canonical, `url` and the site card fallback, but still emits a TMDB image when given. `path` never carries a query string or fragment, except the landing `?page=N` of AC-17. A description that is undefined stays undefined: nothing is invented.
- **AC-11**: Every public page that sets `openGraph` sets its `images` explicitly through `catalogMetadata()`, so no page relies on inheriting the root site card through the shallow metadata merge. Each public page's HTML carries at most one `og:image`, and none only when `siteUrl()` is null and the page has no TMDB image.

*Title pages*

- **AC-12**: A found movie page keeps its current title (`Title (Year)`, or `Title` with no year) and description (overview cut at a word to 160 characters, none when the overview is missing), and adds: canonical `/movies/{id}`, `og:type` `video.movie`, and the share image `backdropUrl` (TMDB `w1280`), else `posterUrl` (`w500`), else the site card.
- **AC-13**: A found show page keeps its current title and description and adds: canonical `/shows/{id}`, `og:type` `video.tv_show`, and the share image `backdropUrl`, else `posterUrl`, else the site card.
- **AC-14**: A found season page keeps its current title (`{season name} · {show name}`) and description, and adds: canonical `/shows/{id}/season/{number}`, `og:type` `website`, and the share image season `posterUrl`, else the show's `backdropUrl`, else the show's `posterUrl`, else the site card.
- **AC-15**: The not found branches stay exactly as they are (`noindex`, no canonical, no Open Graph): on the movie and show pages the malformed id and `not_found` branches, and on the season page the malformed params, `show_not_found` and `season_not_found` branches. The failed branches (`result.kind === "failed"`) keep their titles (`Movie`, `Show`, `Season`) and now also set `robots: { index: false }`, with no canonical and no Open Graph, so a TMDB outage never gets a retry panel indexed.
- **AC-16**: The canonical of a title page ignores the request's query string: `/movies/550?utm_source=x` declares `/movies/550`.

*Landings and search*

- **AC-17**: `/movies` and `/shows` keep their titles (`Movies`, `Shows`) and gain descriptions: "Browse popular movies on BeStats. See the cast, ratings and details, and keep track of what you watch." and "Browse popular TV shows on BeStats. See seasons, episodes and ratings, and keep track of what you watch." Every page of a landing uses the same description. Their `generateMetadata` parses `page` with `parsePageParam`, and builds the canonical path with the page's existing `pageHref` (moved where both the body and `generateMetadata` can call it, not duplicated): page 1 has canonical `/movies` (or `/shows`), page N has canonical `/movies?page=N` (the only query string a canonical may carry). Each of these is `noindex` with no canonical: an invalid page (`parsePageParam` returns null); a page past `lastReachablePage(totalPages)` (the body's "That page doesn't exist" state); and a page whose discover read fails with a `TmdbError`. That read is the same cached call the body makes, so metadata adds no TMDB request. The share image is the site card.
- **AC-18**: `/search` keeps its title and its `robots: { index: false, follow: true }` (spec 0010, AC-22), gains the description "Search movies and TV shows on BeStats by title, genre, release year and TMDB rating.", carries no canonical, and shares as the site card.

*Site card*

- **AC-19**: `app/opengraph-image.tsx` renders a 1200 by 630 PNG with `next/og` `ImageResponse`: the word "BeStats" and the line "Track the movies and TV shows you watch" on the theme background, with `alt` "BeStats, track the movies and TV shows you watch". Its colours come from the `--background`, `--foreground` and `--muted-foreground` values in the `:root` block of `app/globals.css`, read once with `fs.readFile(join(process.cwd(), "app/globals.css"))` while the image is prerendered at build. A small parser pulls each token out of that block and throws, failing the build, when one is missing. The file holds no colour literal of any kind, not even a fallback (`#…`, `rgb(…)`, `hsl(…)`, `oklch(…)`), so `design-tokens-boundary.test.ts` keeps passing unchanged. It uses `ImageResponse`'s bundled default font (no font fetch at build). It reads no request data, calls no TMDB endpoint, and is prerendered at build.
- **AC-20**: The root layout's metadata gains a default `openGraph` (`siteName`, `type: "website"`, `locale: "en_US"`, the site card) and `twitter` (`card: "summary_large_image"`), so private and auth pages, which set no `openGraph`, share as the site card. Their existing `robots` values are unchanged.

*Structured data*

- **AC-21**: A found movie page renders one `<script type="application/ld+json">` holding an object with `"@context": "https://schema.org"` and `"@type": "Movie"`, and: `name`; `url` (the canonical, omitted when `siteUrl()` is null); `image` (`posterUrl`); `datePublished` (`releaseDate`); `description` (the full overview); `genre` (genre names); `duration` (`PT{runtimeMinutes}M`); `actor` (`cast` sorted ascending by `order`, then the first 10, each `{ "@type": "Person", name }`). A field whose source is null, empty or zero is left out, never filled with a placeholder. There is no `aggregateRating`, `review`, `contentRating`, `sameAs` or `inLanguage`.
- **AC-22**: A found show page renders one JSON-LD object with `"@context": "https://schema.org"` and `"@type": "TVSeries"`, and: `name`, `url`, `image` (`posterUrl`), `startDate` (`firstAirDate`), `endDate` (`lastAirDate`, only when `isFinishedShowStatus(status)` is true), `description`, `genre`, `numberOfSeasons` (`show.numberOfSeasons`), `numberOfEpisodes` (`show.numberOfEpisodes`), under the same omission rule and with no rating fields. Season pages render no JSON-LD.
- **AC-23**: The JSON-LD is serialized by one helper, `jsonLdScript()` in `lib/seo/json-ld.ts`, which runs `JSON.stringify` and then replaces every less than sign with the six character JSON escape backslash `u003c`, and every U+2028 and U+2029 character with its own backslash `u2028` / `u2029` escape, so TMDB text containing a closing script tag cannot end the tag and stays valid JavaScript. It renders inside the found branch of the page body (inside its existing Suspense boundary), never in the loading, failed or not found branches.

*Boundaries*

- **AC-24**: No metadata function, the sitemap, `robots.txt` or the site card reads cookies, headers or the session, or imports `lib/supabase/`. A test greps `lib/seo/`, `app/robots.ts`, `app/sitemap.ts` and `app/opengraph-image.tsx` for `cookies(`, `headers(`, `lib/supabase` and `getOptionalUser`/`requireUser`, and finds none. `pnpm build`, run with a TMDB token, still prerenders the static shells of `/movies`, `/shows`, `/movies/[id]`, `/shows/[id]`, `/shows/[id]/season/[number]` and `/search`, and lists `/robots.txt`, `/sitemap.xml` and `/opengraph-image` as prerendered.
- **AC-25**: `proxy.ts`'s matcher excludes `robots.txt`, `sitemap.xml` and `opengraph-image`, the same way it excludes `api/`, so a session refresh can never attach `Set-Cookie` to a response a CDN must be free to cache. Signed out and signed in, the three answer 200 with no redirect and no `Set-Cookie`; the proxy matcher test covers the three paths. Every private and auth page keeps the `robots` value it has today, and the not found pages keep `noindex`.

## Decision

**Chosen option**: Option 1: Fix in place with Next.js metadata files and two small helpers

Keep the existing per page `generateMetadata` functions, route all canonical, Open Graph and X fields through one `catalogMetadata()` helper, add JSON-LD through one `jsonLdScript()` helper, and add `app/robots.ts`, `app/sitemap.ts` and `app/opengraph-image.tsx` from the Next.js metadata file conventions. The sitemap reuses the landings' cached TMDB discover reads; no new dependency, table or environment variable is introduced (`VERCEL_ENV` is set by Vercel itself).

**Implementation skills**: `next-cache-components-adoption` (`vercel/next.js`, `.agents/skills/next-cache-components-adoption/`) for keeping every route prerenderable with `use cache` and `cacheLife` in the sitemap · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) for checking the emitted tags in the running app

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: none. Nothing is stored. TMDB stays the only source of catalog metadata (spec 0008's no catalog cache decision holds).

**New and changed files**:

| File | Kind | What it holds |
|---|---|---|
| `lib/seo/site.ts` | new, pure | `siteUrl()`, `isIndexableDeployment()` |
| `lib/seo/metadata.ts` | new, pure | `catalogMetadata()`, `SITE_CARD_PATH = "/opengraph-image"` |
| `lib/seo/json-ld.ts` | new, pure | `movieJsonLd()`, `showJsonLd()`, `jsonLdScript()` |
| `app/robots.ts` | new | `MetadataRoute.Robots` per AC-4, AC-5 |
| `app/sitemap.ts` | new | `MetadataRoute.Sitemap` per AC-6 to AC-9, its body in a `use cache` function |
| `app/opengraph-image.tsx` | new | the site card, AC-19 |
| `app/layout.tsx` | changed | `metadataBase`, default `openGraph` and `twitter` |
| `app/movies/[id]/page.tsx`, `app/shows/[id]/page.tsx`, `app/shows/[id]/season/[number]/page.tsx` | changed | `catalogMetadata()`, failed branch `noindex`, JSON-LD in the found body (not on season) |
| `app/movies/page.tsx`, `app/shows/page.tsx` | changed | `metadata` becomes `generateMetadata` per AC-17 |
| `app/search/page.tsx` | changed | description and site card, AC-18 |
| `proxy.ts` | changed | matcher excludes the three metadata routes, AC-25 |
| `.env.example` | changed | a commented note that `VERCEL_ENV` is set by Vercel and may be set to `production` locally to test the indexable branch |

`lib/seo/` stays free of `server-only` and of any TMDB import, like `lib/catalog/`, so tests import it directly. The pages pass normalized TMDB values in.

**API surface** (public, unauthenticated, all GET):

| Route | Output | Cache | Errors |
|---|---|---|---|
| `/robots.txt` | text, AC-4 or AC-5 | prerendered at build | none |
| `/sitemap.xml` | XML `urlset`, AC-6 to AC-9 | `days`, or `minutes` after any failed read | never non 200; failures shrink the list |
| `/opengraph-image` | 1200 by 630 PNG | prerendered at build | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| any URL field | the site origin | `NEXT_PUBLIC_SITE_URL` through `siteUrl()` |
| robots, sitemap | indexable or not | `VERCEL_ENV` (set by Vercel per deployment) plus `siteUrl()` |
| sitemap | movie ids, show ids | `discoverMovies({ page })`, `discoverTvShows({ page })` for pages 1 to 10, default options, the landings' calls |
| sitemap | cache lifetime | derived: all 20 reads ok → `days`, else `minutes` |
| movie metadata | title, description | unchanged, `loadMovie` (spec 0006, AC-12) |
| movie metadata | share image | `movie.backdropUrl` → `movie.posterUrl` → site card |
| show metadata | share image | `show.backdropUrl` → `show.posterUrl` → site card |
| season metadata | share image | `season.posterUrl` → `show.backdropUrl` → `show.posterUrl` → site card |
| landing metadata | page number | `parsePageParam(searchParams.page)` |
| landing metadata | failed or not | the same cached `discoverMovies` / `discoverTvShows` call the body makes |
| landing, search | description | the fixed copy in AC-17, AC-18 |
| `og:type` | per page | fixed: `video.movie`, `video.tv_show`, `website` |
| `og:locale` | `en_US` | fixed: all product copy is English (`AGENTS.md` section 3) |
| movie JSON-LD | name, image, datePublished, description, genre, duration, actor | `movie.title`, `posterUrl`, `releaseDate`, `overview`, `genres[].name`, `runtimeMinutes`, `cast` sorted by `order`, first 10 |
| show JSON-LD | name, image, startDate, endDate, description, genre, numberOfSeasons, numberOfEpisodes | `show.name`, `posterUrl`, `firstAirDate`, `lastAirDate` gated by `isFinishedShowStatus(show.status)`, `overview`, `genres[].name`, `numberOfSeasons`, `numberOfEpisodes` |
| site card | colours | `--background`, `--foreground`, `--muted-foreground` parsed from `app/globals.css` at build |
| site card | font | `ImageResponse` default font |

**Key invariants**:
- No SEO surface reads a cookie, a header or the session, so nothing user specific can reach a shared cache, a share card or the sitemap (`AGENTS.md` section 11).
- Every emitted URL is absolute and built from `siteUrl()`; when it is null the field is omitted, never guessed.
- A rating never appears in metadata or JSON-LD. TMDB community ratings stay on the page, clearly labelled, and personal ratings are private.
- Missing TMDB values are omitted, never invented (`AGENTS.md` sections 3 and 14).
- Each URL in the sitemap is a page a signed out visitor can open from a landing.

**Security model**: everything here is public and unauthenticated. The sitemap lists only public catalog URLs and reads only public TMDB data. JSON-LD escapes `<`, so third party text cannot inject markup. The TMDB token stays in `lib/tmdb/env.ts`; the sitemap reaches TMDB only through `lib/tmdb`'s public reads.

**Configuration required**: no new variable. `NEXT_PUBLIC_SITE_URL` (exists) must be the production origin on the production deployment; `VERCEL_ENV` is provided by Vercel. Feature 20 sets both on the real project.

**Critical test scenarios**:
- Happy path: on a local `pnpm build` and `pnpm start` with `VERCEL_ENV=production`, `/movies/550` carries canonical, one TMDB `og:image`, `twitter:card` and a `Movie` JSON-LD with no rating; `/sitemap.xml` lists `/movies`, `/shows` and about 400 title URLs; `/robots.txt` names the sitemap. Verifies **AC-4**, **AC-6**, **AC-10**, **AC-12**, **AC-21**
- Failure case: the sitemap with two of its 20 discover reads failing lists the rest, answers 200 and picks `minutes`; a movie page whose TMDB read fails is `noindex`. Verifies **AC-8**, **AC-15**
- Deployment gate: with `VERCEL_ENV` unset, robots disallows everything and the sitemap is empty with no TMDB call. Verifies **AC-2**, **AC-5**, **AC-9**
- Missing config: with `NEXT_PUBLIC_SITE_URL` unset, the build succeeds and `/movies/550` renders 200 with a TMDB image and no canonical. Verifies **AC-1**, **AC-3**
- Injection: an overview containing `</script><script>alert(1)</script>` serializes with the backslash `u003c` escape in place of each less than sign and stays inside one script tag. Verifies **AC-23**
- Privacy: signed in, `/sitemap.xml` and `/robots.txt` are byte for byte what a signed out request gets, and every public page's `<head>` metadata tags match too; none of the three metadata routes sends `Set-Cookie`. Verifies **AC-24**, **AC-25**

## Build plan

Tracer Bullet: the first slice proves the pipe from environment to crawler output with no TMDB; the second carries one title page end to end; later slices thicken.

1. Add `lib/seo/site.ts` with `siteUrl()` and `isIndexableDeployment()`, plus unit tests for each environment combination, satisfies **AC-1**, **AC-2**
2. Add `app/robots.ts` and a first `app/sitemap.ts` that lists only `/movies` and `/shows` on an indexable deployment and an empty `urlset` otherwise, and exclude the three metadata routes from the `proxy.ts` matcher (with its test); check both in `pnpm build` output and over HTTP signed out, satisfies **AC-4**, **AC-5**, **AC-9**, **AC-25**
3. Add `lib/seo/metadata.ts` (`catalogMetadata()`), `app/opengraph-image.tsx` reading the three tokens from `globals.css`, and the root layout's `metadataBase`, default `openGraph` and `twitter`, satisfies **AC-3**, **AC-10**, **AC-11**, **AC-19**, **AC-20**
4. Wire the movie page: `catalogMetadata()` in the found branch, `noindex` in the failed branch, and `lib/seo/json-ld.ts` (`movieJsonLd()`, `jsonLdScript()`) rendered in the found body, with unit tests for omission and escaping, satisfies **AC-12**, **AC-15**, **AC-16**, **AC-21**, **AC-23**
5. Wire the show and season pages the same way, with `showJsonLd()` on the show page only, satisfies **AC-13**, **AC-14**, **AC-15**, **AC-22**
6. Thicken the sitemap: the 20 discover reads with independent failure, dedupe, ordering and the `days` or `minutes` lifetime inside its `use cache` function, with unit tests on a mocked `lib/tmdb`, satisfies **AC-6**, **AC-7**, **AC-8**
7. Convert `/movies` and `/shows` to `generateMetadata` with descriptions and per page canonicals, and add the `/search` description and site card, satisfies **AC-17**, **AC-18**
8. Proof: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (route table shows the prerendered shells and the three metadata routes), then in the running app check the heads of every public page type, the not found and failed branches, a private page and an auth page, signed out and signed in, and with `NEXT_PUBLIC_SITE_URL` unset, satisfies **AC-11**, **AC-24**, **AC-25**

## Consequences

**Positive**:
- Shared links show real artwork, and search engines get one address per page, a sitemap and structured facts, with no new dependency, table or secret.
- Preview and local deployments can never be indexed by accident.
- The sitemap shares its TMDB reads with the landings, so it usually costs no extra request.

**Negative / tradeoffs**:
- The sitemap covers only the 400 most popular titles. Long tail titles are found only by crawling from landing and title pages.
- Share images hotlink TMDB's CDN. If TMDB changes an image path, an old share preview may break until the platform recrawls.
- On a deployment that is not production, or with `NEXT_PUBLIC_SITE_URL` unset, the SEO surface is silently reduced. That is by design, but a wrong production variable would quietly hide the site from search; feature 20's checklist must confirm both values.
- Streaming metadata means metadata for JavaScript capable crawlers lands in the body rather than the head. Next.js blocks for HTML limited bots, and Google reads streamed tags, so this is accepted rather than forced off with `htmlLimitedBots`.
- Landings' metadata now awaits `searchParams` and a cached TMDB read, which streams their metadata instead of baking it into the shell.

**Neutral**:
- No migration. Rollback is reverting the commit.
- The site card uses the default `ImageResponse` font rather than Inter. If the card should match the UI typeface exactly, load Inter's font file in a later change.

### Changes to earlier specs

- Spec 0006 (AC-12) and spec 0009 (AC-16): the failed branch of the movie and show pages now sets `noindex` (AC-15 here). Titles and descriptions are unchanged.
- Spec 0010 (AC-22): `/search` keeps `noindex, follow` and gains a description and site card only.

## Follow-up

- [ ] Feature 20 (deploy): set `NEXT_PUBLIC_SITE_URL` to the exact production origin on the production deployment (a `localhost` value there would silently produce wrong canonicals), confirm Vercel exposes `VERCEL_ENV` to production builds, and after the first deploy submit `{origin}/sitemap.xml` in Google Search Console.
- [ ] Feature 18 (legal pages): when the privacy and terms pages exist, decide whether they join the sitemap; they are not in it now because they do not exist yet.
