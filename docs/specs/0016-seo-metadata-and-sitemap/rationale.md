# 0016. SEO metadata and sitemap: rationale

The decision record behind [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

BeStats's public catalog (the `/movies` and `/shows` landings, every movie, show and season page, and `/search`) is meant to be found and shared. Some groundwork already exists: the root layout has a title template and a default description; movie, show and season pages have `generateMetadata` with a title and a 160 character description from TMDB; `/search`, every private page, the auth pages and the soft 404s already carry `noindex`. What is missing is everything that needs an absolute address or a crawler file: there is no `metadataBase`, no canonical link, no Open Graph or X card, no structured data, no `robots.txt` and no sitemap. A shared link today previews as plain text.

The forces are specific to this app. The catalog is TMDB's, which holds hundreds of thousands of titles, and spec 0008 decided not to store any TMDB metadata in Postgres, so a sitemap cannot enumerate "every page". Every public route runs under `cacheComponents` with a prerendered static shell, and pages stream their TMDB content inside Suspense, so any new metadata work must not read request data or block the shell. Two pages already write on load, and `AGENTS.md` section 11 forbids private data in shared caches, so SEO surfaces must stay strictly public. The project rule that a missing or partial configuration never takes the public catalog down (`publicEnvProblems()`) applies here too, and `NEXT_PUBLIC_SITE_URL` is the only origin the app knows. `design-tokens-boundary.test.ts` forbids colour literals outside `app/globals.css`, which constrains any generated image. Deployment is Vercel (feature 20), whose preview deployments are public URLs.

Not deciding leaves shares unattractive, invites duplicate URLs (`?utm_source=` variants) to split ranking, and risks preview deployments being indexed beside production once feature 20 ships.

## Options considered

### Option 1: Fix in place with Next.js metadata files and two small helpers

Keep the per page `generateMetadata` functions, add one pure helper that builds canonical, Open Graph and X fields, one pure JSON-LD helper, and the `robots.ts`, `sitemap.ts` and `opengraph-image.tsx` file conventions. Share images hotlink TMDB; the site card is generated once at build. The sitemap reuses the landings' cached discover reads.

**Pros**:
- No dependency, table or secret; uses the framework's own metadata API, which already understands streaming and bots.
- One helper means every page gets identical canonical and card rules, and tests can cover it without rendering pages.
- Sitemap reads share cache entries with the landings.

**Cons**:
- Coverage of the sitemap is limited to popular titles.
- Hotlinked share images depend on TMDB's CDN paths staying stable.

### Option 2: Generated branded share card per title

Same as option 1, but each title gets an `opengraph-image.tsx` in its route that composes the backdrop, the title and the BeStats mark with `ImageResponse`.

**Pros**:
- A consistent, branded preview for every title.

**Cons**:
- Every first share renders an image on the server and calls TMDB, adding cost and a new failure point per title.
- Under `cacheComponents` each per id image route needs its own caching and failure handling.
- More code to keep within the colour token rule.

### Option 3: A third party SEO library

Adopt a library that wraps metadata and JSON-LD helpers.

**Pros**:
- Typed schema.org builders out of the box.

**Cons**:
- Duplicates what the Next.js Metadata API already does, and adds a dependency to track across Next.js releases.
- The JSON-LD shapes needed here are two small objects; a library is more surface than the problem.

### Option 4: A complete sitemap from TMDB's daily id exports

Build a sitemap index from TMDB's daily export files of every movie and show id.

**Pros**:
- Every title is listed.

**Cons**:
- Hundreds of thousands of URLs, many of them thin or adult, that would need filtering and storage, against the no catalog cache decision.
- Needs a scheduled job and storage the project does not have.

## Rationale

Option 1 fits every force in the Context. The framework's metadata files already handle what this app needs (streaming metadata for capable crawlers, blocking metadata for HTML limited bots, prerendering of robots, sitemap and the card), so the work is wiring, not infrastructure. Routing every page through `catalogMetadata()` matters because Next.js merges metadata shallowly: a page that sets `openGraph` without `images` silently loses the root card. Making the helper always set images explicitly closes that gap once instead of on every page.

The sitemap lists landings plus the 200 most popular titles of each media type because those are exactly the titles a signed out visitor reaches from the landings, so every entry is a real, reachable public page, and the reads are the landings' own cached calls. Season pages and `?page=` variants are left out: they are reachable by links, and listing them would multiply TMDB reads for little gain. Option 4's full export was rejected because it contradicts spec 0008 and adds a job and storage the project does not need yet. On failure the sitemap shrinks rather than erroring, because crawlers treat a failing sitemap worse than a short one, and a short `minutes` lifetime brings the full list back quickly.

Share images hotlink TMDB rather than being generated (option 2) because a per title render adds server cost and a TMDB call on the share path for a cosmetic gain; the backdrop at `w1280` is already the right landscape shape. The site card is generated once at build so no asset file is needed, and it reads its colours from `globals.css` so the token rule stays whole with no exemption. Runner up for the card was exempting the file from the token test, rejected because it erodes the rule the test exists to protect.

JSON-LD carries no `aggregateRating`: Google's review snippet rules forbid marking up ratings gathered by another site, and TMDB's rating is exactly that, while personal ratings are private. Robots disallows only `/api/` and `/auth/` because blocking a `noindex` page in robots hides the tag from crawlers and can still leave the bare URL indexed. Preview and local deployments disallow everything, gated on `VERCEL_ENV`, since previews are public and Vercel sets the variable on every deployment. When `NEXT_PUBLIC_SITE_URL` is missing, SEO fields degrade rather than throw, matching the project rule that a configuration gap never takes the catalog down. Failed TMDB branches become `noindex` because a retry panel titled "Movie" is worse in results than a page briefly absent, and the next crawl restores it.

Decisions made in writing (not asked):
- `og:type` `video.movie` and `video.tv_show` for titles and `website` for seasons and landings (runner up: `website` everywhere, which loses the media hint).
- `og:locale` fixed to `en_US`, since product copy is English.
- Movie JSON-LD lists the first 10 cast members because `cast` is already loaded; show JSON-LD has no actors because show cast is a separate read, and adding it to metadata would add a TMDB request.
- No `lastModified` in the sitemap: TMDB gives no reliable change date, and an invented one would mislead crawlers.
- The default `ImageResponse` font for the site card, to avoid fetching a font file at build (runner up: loading Inter's file for an exact match).
- Landing metadata reuses the body's cached discover read so a failed landing can be `noindex` at no extra request cost.
