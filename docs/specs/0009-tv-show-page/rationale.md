# 0009. TV show page: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

Scope feature 10 asks for a public TV detail page with cast, seasons and episode lists (including season 0 specials), air dates and TMDB's show status, where incomplete episode data and missing air dates display honestly. Until search ships (feature 11) there is no way to reach a show, and `/shows` is still the placeholder spec 0004 left.

A show is not a movie with extra fields. It has a variable number of seasons, from one to over forty, and each season's episodes come from a separate TMDB request (`/tv/{id}/season/{n}`). Episodes carry the air dates that features 12, 14, 15 and 16 build their eligibility, progress, Up Next and completion rules on, and `getShowEpisodes` already reuses the cached show read to fan out over seasons for those features. Whatever the show read carries, every later TV list screen pays for.

The page must stay public and cacheable (`AGENTS.md` section 7, spec 0006's shell pattern with `cacheComponents` on), show nothing invented (`AGENTS.md` sections 3 and 14), keep TMDB community ratings visibly distinct from personal ones (section 9), and handle season 0 as a real, browsable season while later features exclude it from progress. `AGENTS.md` section 12 also asks that time sensitive metadata such as newly aired episodes and changed show statuses refresh; the show read is cached for `days` today.

`design/` has no show, season or episode artboard. As with features 7 and 8, the layout has to be proposed from the existing references and approved in the spec. Later features (12 episode tracking, 13 calculated ratings, 14 status) all attach controls to these pages, so where each piece of the layout lives decides how much those features have to rework.

## Options considered

### Option 1: Show route plus a season route, cast as its own read (chosen)

`/shows/[id]` shows the hero, overview, a grid of season cards and the series cast. Each season card opens `/shows/[id]/season/[n]`, which lists that season's episodes. Both pages stream inside prerendered shells from cached reads. The series cast comes from TMDB's aggregate credits through a new cached read, and the show read drops credits.

**Pros**:
- Each page makes a fixed, small number of cached reads, whatever the show's size.
- Every season has a shareable URL, and features 12 and 13 get an obvious home for mark season watched and the season rating.
- No client component is needed for navigation between seasons.
- The show read that `getShowEpisodes` and the list screens reuse stays small.

**Cons**:
- Three routes, two server loaders and more proxy patterns to maintain.
- Browsing several seasons means page navigations instead of an instant tab switch.
- The show page makes two TMDB requests instead of one.

### Option 2: One show page with a season picker in the URL

`/shows/[id]?season=N` renders the show and one season's episodes on the same page, with season tabs that change the search param.

**Pros**:
- One route; the show context stays on screen while switching seasons.
- Still one season read per view.

**Cons**:
- The show page carries hero, overview, cast, tabs and a full episode list, and grows heavier again once tracking controls arrive.
- The tabs and the episode list re render together, and the tab row needs careful keyboard handling as a new component with no reference.
- A search param selecting content makes metadata and canonical URLs per season harder (feature 17).

### Option 3: All seasons expanded on the show page

An accordion of every season, each loading its episodes.

**Pros**:
- Everything about a show on one page; simplest mental model for a short show.

**Cons**:
- Either one TMDB request per season on first view (dozens for a long show) or a client fetch path per season, which this project has no pattern for.
- The page becomes very long and slow for shows like The Simpsons.

### Option 4: Same routes as Option 1, keeping plain credits in the show read

Identical pages, but the cast stays as `append_to_response=credits` on the show read, as spec 0002 built it.

**Pros**:
- One request per show page, no new read, smallest module change.

**Cons**:
- TMDB's plain TV credits list only the latest season's regular cast, so an ended show can miss its early leads.
- Switching that append to aggregate credits instead would make the shared show read up to about 1.2 MB (measured for Grey's Anatomy), which every progress and Up Next read would then download.

## Rationale

Option 1 is the only shape where the page's cost does not grow with the show's size and where the pieces later features need already have a home. The season route keeps each view to the show read plus one season read, both already cached (`hours`) by the existing module, and it puts mark season watched and the season rating (features 12 and 13) on a page about exactly one season. Option 2 saves a route but piles every future control onto one page and needs a new tab component with no reference. Option 3 fails the bounded cost test outright.

The cast decision follows from what `getShowEpisodes` already does. It reuses `getTvShow`, and features 14 to 16 will call it for every tracked show. Plain credits give the wrong cast for ended shows (Option 4's weakness). Appending aggregate credits to the shared read would make every one of those calls pay for a cast list nobody on those screens shows. A separate `getShowCast` cached for `days` gives the right cast and keeps the shared read lean. Capping the normalized cast at 12 inside the module is a deliberate exception to "return what TMDB returns", because TMDB can return hundreds of people and the cached value is kept in memory.

Moving the show read from `days` to `hours` follows `AGENTS.md` section 12: a new season, a status change to `Ended`, or a new last air date should not take days to appear, and feature 16's completion rule depends on the status. The upcoming label is left out deliberately. Showing it means choosing an "aired" boundary (UTC today, the viewer's local date, or something else), which features 12 and 14 must document as a product rule. Choosing it here, inside a cached page that has no request time clock, would either fix that rule early or make the season page dynamic.

The layout reuses the movie hero, `CastRow`, `PosterCard`, `PosterGrid`, `StatePanel`, `RetryLink` and the not found patterns rather than inventing a TV look, because `design/` gives no TV reference and spec 0006 asked this feature to reuse them. The unknown season case renders inline instead of through `notFound()` only because a `not-found.tsx` cannot see the route params it would need to link back to the show.

### Decisions settled while writing (runner up in brackets)

- Route segment `/shows/[id]/season/[number]`, mirroring TMDB's own path. [`/seasons/[number]`]
- Season numbers accepted up to 9999, which is well above any real TMDB season and keeps the parser a simple pattern. [no upper bound]
- The air span needs no clock: open ended (`–present`) only when TMDB reports a last air date and the status is not `Ended` or `Canceled`. [compare the first air date with today]
- Air dates format as UTC calendar dates, so a server timezone can never shift a date by one day. [local server time]
- Episode names fall back to `Episode {number}` as the heading, which is a label, not invented content. [a separate "Untitled" text]
- The status pill sits on the meta line and the genres wrap to their own row, so the status is never read as a genre. [status as meta line text]
- `parseMovieId` is renamed to `parseTmdbId` rather than duplicated, since the rule is the same for any TMDB id. [a second `parseShowId` with the same body]
- The cast section streams on its own and fails on its own, since it is a separate request and should not blank a page that loaded. [one boundary for the whole page]
