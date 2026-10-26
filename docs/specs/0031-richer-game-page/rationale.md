# 0031. Richer game page: rationale

## Context

The game page from spec 0025 shows only a hero: cover, name, date, release kind, genres, platforms and the IGDB rating. Movie and show pages go further, with a backdrop, a Trailer button, an overview with credits, More like this, and Facts. On a game page there is nothing to read, watch or compare. G9 closes that gap in the order the scope set: hero, summary, developer and publisher, screenshots, trailer, similar games, Facts.

Forces that shape the choice:

- **IGDB is rate limited** (4 requests a second, shared by every page render on an instance) and reached through one limiter. Each extra request per page view costs capacity that search and the landing also need.
- **IGDB can expand nested fields in one query** (`involved_companies.company.name`, `release_dates.platform.name`), unlike TMDB, where the movie page needed a separate extras read for videos, providers and recommendations.
- **Similar games need card data** (cover, rating, hidden flag, release date for the G8 slots). `similar_games` alone gives only ids.
- **The shell must stay prerendered** (spec 0025, AC-9), and nothing may be invented when IGDB is silent.
- **Release dates are messy**: one entry per platform and region, often partial (a year, a quarter) or TBD.

## Options considered

### Option 1: widen `getGame`, plus one batch for similar cards (chosen)

Add every new field to the existing single `getGame` request. Similar cards come from the existing cached `getGamesByIds`, in their own Suspense boundary.

**Pros**: one IGDB request for the hero and four sections. Reuses the summary normalization, the hidden filter and the G8 cards as they are. Only the section that can fail alone fails alone.
**Cons**: a bigger payload on the hero's critical path. A `getGame` failure takes every section down together.

### Option 2: a separate `getGameExtras` read

Mirror TMDB: keep `getGame` lean and add a second cached read for the new data, with each section streaming in its own boundary.

**Pros**: the hero renders sooner, and the sections fail on their own.
**Cons**: two or three IGDB requests per page against a 4 a second limit. More code (a new read pair, schema, cache wrapper and surface entry). The extras would fail in exactly the conditions `getGame` fails, so the isolation buys little.

### Option 3: one request including the similar games' card fields

Expand `similar_games.cover.image_id`, `similar_games.rating` and the filter fields inside `getGame`.

**Pros**: truly one request.
**Cons**: it duplicates `normalizeSummary` and the catalog filter inside the detail read, and it makes the hero wait on the similar cards' data too. IGDB's nested expansion of catalog filter fields is also unproven here.

## Rationale

IGDB's nested expansion removes the reason TMDB needed an extras read, and the rate limit makes every extra request per page view a real cost. That makes widening `getGame` the boring choice: one cache entry and one failure mode, which is the one the page already handles. Similar cards are the exception, because they need full summary normalization and the hidden filter, which `getGamesByIds` already does and caches. Isolating that one read also matches the movie page, where More like this fails alone.

Smaller calls made in this spec, each with its runner up:

- **Trailer as a hero button**, not a section. It matches movies and shows, and IGDB gives no thumbnail, so a section would either be empty or add YouTube's image host before any click. Runner up: a section with a play tile over the art.
- **Trailer pick**: the first video named like a trailer, else no button, so the button never opens gameplay footage under a "Trailer" label. Runner up: fall back to any video.
- **Screenshots: a row plus a dialog**, capped at 12 and ordered by `image_id`. Thumbnails are small on phones, the dialog reuses the trailer dialog's frame, and the cap bounds the payload. No wraparound, because `3 of 12` with disabled ends is clearer about position. Runner up: wraparound.
- **Backdrop from artwork, else screenshot**: this reuses spec 0028's `artUrl`, so the home hero and the game hero always pick the same image.
- **Overview layout**: the summary, then the storyline under `Story`, then `Developed by` and `Published by` lines, mirroring `Directed by` on movies. The no text placeholder is dropped, because the scope says to leave a section out rather than say "No overview available".
- **Facts**: the scope's five, plus Series and Game engine, which the engineer chose. Plural labels switch on count only where a single value is the norm (Franchise, Game engine).
- **Release dates**: one line per platform, the earliest across regions (the same global rule as the hero's first release date), at IGDB's stated precision, built from `date_format` rather than IGDB's `human` string so the format matches the rest of the app. TBD reads `TBA`, because IGDB states it; this is not an invented value.
- **Skeleton with a backdrop**: most games with a page worth visiting have art, so a backdrop footprint shifts the layout least on average.

Added during the build and kept, though no criterion asked for them:

- **The dialog image's alt is `Screenshot {n} of {total}`**, while the thumbnails stay `alt=""` behind their named buttons. The dialog holds one image and nothing else names it, so a screen reader landing on it hears what it is, not only the live region's count.
- **Focus moves to the other arrow when Previous or Next turns disabled**, so a keyboard user at either end is never left on a disabled button, where focus would drop to the dialog.
- **`IgdbField` admits `date` and `date_format`**, which only `igdb.live.ts` writes into a body, so the live check can ask IGDB for real quarter and TBD entries (AC-14).
