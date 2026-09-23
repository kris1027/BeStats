# 0006. Movie page: rationale

The decision record behind [index.md](index.md). `/develop` builds from `index.md` and can skip this file.

## Context

Slice 1 is the thin real thread through the product: browse a movie, sign in, track it, see it in your list. Authentication is done; the next visible piece is the movie itself. Until now `/movies` is a placeholder empty state, and no route shows a single title, so there is nothing for feature 8's tracking controls to attach to and no way to reach a movie at all, since search does not arrive until feature 11.

The forces are mostly inherited. The TMDB module (spec 0002) already returns a normalized `Movie` with cast in one cached request, and treats missing data as null. The UI foundation (spec 0004) already has the poster card, the TMDB badge, the glass pill, the state panel and the skeletons. `cacheComponents` is on, so every route must either prerender a shell or opt out explicitly, and a `notFound()` thrown after the shell has streamed can no longer change the status code. `AGENTS.md` section 3 requires that a screen with no reference in `design/` be proposed and approved rather than invented, and `design/` has no detail page. Section 3 also asks for original language text when English is missing, and section 9 requires the TMDB rating to be impossible to confuse with a personal one.

Two smaller pressures shaped the edges. TMDB flags some titles as adult, which every discovery path already excludes, but a typed URL reaches them directly. And the module caches every failure for a minute, which would turn a "Try again" button into a button that does nothing for that minute.

If this is not decided, feature 8 has no page to build on, feature 10 has no pattern to copy for TV, and the first catalog surface gets its layout, its failure behaviour and its not found behaviour improvised during the build.

## Options considered

### Option 1: Prerendered shell with a streamed body, hybrid not found

The route shell prerenders; the movie body awaits `params` inside `Suspense` and reads the `days` cached `getMovie`. A malformed id is caught in the proxy with a pattern check and answered with a real 404. An id TMDB does not know, or an adult one, renders the not found panel inside the already streaming page, which Next marks `noindex` but sends as status 200.

**Pros**:
- Instant navigation: the shell and skeleton commit immediately, the body fills from cache.
- No TMDB call at build time, so a TMDB outage can never break a deploy.
- Any id works, with no list of pages to prebuild.
- The common bad URL (a typo, a slug, a stray character) still gets a true 404 without a network call.

**Cons**:
- A well formed but unknown id is a soft 404 (200 with `noindex`).
- The proxy gains a route specific rule.

### Option 2: Blocking render, real 404 everywhere

Opt the detail route out of the shell with `export const instant = false`, so the page renders fully on the server before the first byte and `notFound()` sets a real 404.

**Pros**:
- A correct status code for every not found case, the simplest mental model.
- No proxy change.

**Cons**:
- Every navigation to a movie waits for TMDB on a cold cache, with no skeleton to show progress.
- Goes against the project's Cache Components direction, and every later detail route would likely copy it.

### Option 3: Option 1 plus prebuilt popular ids

As Option 1, plus `generateStaticParams` returning the first page of popular movies so those pages are fully static.

**Pros**:
- The most visited pages are fully static HTML.

**Cons**:
- The build now depends on TMDB being reachable and fast.
- Popularity changes daily, so the prebuilt set goes stale while the `days` cache already makes those pages fast after one visit.

### Option 4: Real 404 through a TMDB check in the proxy

As Option 1, but the proxy asks TMDB whether the id exists before rendering.

**Pros**:
- A true 404 for every unknown id while keeping the streamed shell.

**Cons**:
- Every movie request pays a TMDB round trip in the proxy, outside the page cache, which is exactly the cost the cache exists to remove.
- The proxy would need the server only TMDB module and its token.

## Rationale

Option 1 wins because the thing a visitor feels is navigation speed, and the thing a crawler needs is not to index junk. The streamed shell gives the first, and `noindex` gives the second for the rare unknown id, while the proxy check gives a true 404 for the overwhelmingly common bad URL (anything that is not a number) at no cost. Option 2 buys a cleaner status code with a visible wait on every cold visit, a poor trade for a catalog that has millions of titles and a cache that is empty for most of them. Option 4 gets the status right by paying the TMDB round trip the cache exists to avoid. Option 3 adds a build dependency on a third party for a speedup the `days` cache already delivers after one visit.

The landing is a paginated popular grid because it is the only entry point to movies until feature 11, and it costs no new TMDB read: `discoverMovies` already defaults to popularity order, and `PosterGrid` and `PosterCard` already exist. Previous and next links over numbered pages or a load more button, because they are shareable, visible to crawlers as plain anchors, and add no client boundary. (The first draft also claimed they work without JavaScript. They cannot: they stream inside the grid's Suspense boundary, which stays hidden until React's script runs. The instant shell was judged worth more than a script free landing, so AC-2 dropped the claim.) The 500 page cap is TMDB's own limit, and showing it prevents a Next link that leads to an error.

The detail layout follows TV Time's pattern (a faded backdrop with the poster overlapping it) because it uses artwork TMDB already returns and gives the page a clear focal point, while being composed entirely from spec 0004's pieces. When the backdrop is missing the hero collapses rather than blurring the poster, because stretching the poster into a background would be artwork TMDB did not supply. The cast is a single scrolling row of 12 because a grid pushes a phone page very long and a "show more" needs a new client boundary. The rating block gets a visible "TMDB" label and the vote count because section 9 demands the community score never be mistaken for a personal one, and feature 8 is about to put a personal score right next to it.

The original language overview comes from appending `translations` to the existing request, so the fallback costs no extra round trip, and marking it with `lang` keeps screen readers pronouncing it correctly. Adult titles become not found rather than shown, to match `include_adult=false` on every other path. The failure profile split fixes a real defect the retry link exposed: a transient failure cached for a minute makes "Try again" a lie. `not_found`, `unauthorized` and `bad_response` keep a minute because retrying them sooner cannot succeed; timeouts, rate limits and upstream errors drop to seconds. The rate limit case is the debatable one, since faster retries add load during a limit; the module's bounded retry budget per request keeps that contained, and the alternative is a page that cannot recover for a minute after TMDB does.

The tracking slot renders nothing, because a button that does not work yet, or a "Sign in to track" link, would promise feature 8 before it exists and would make the page read the session, costing the prerendered shell. Metadata is set now because it is one call to a read the page already makes; everything beyond title and description stays with feature 17.
