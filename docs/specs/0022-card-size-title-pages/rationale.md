# 0022. Consistent card size and richer title pages: rationale

## Context

> ⚠️ Premise note: the card strand partly reverses [prompts/grid-tabs-footer-legend.md](../../../prompts/grid-tabs-footer-legend.md), which moved every grid from 2/3/4/5/6 columns to 2/4 so a 20 title page fills five complete rows. Six columns bring the ragged last row back, and TMDB pages are fixed at 20, so a page size change cannot fix it on the catalog pages. The owner accepted the ragged row in the 2026-10-12 grilling session in exchange for one card size everywhere. Spec 0004 AC-9 originally asked for exactly these column counts.

**Card size.** Spec 0021 gave the home rows fixed width cards, 140px below `md` and 180px from it (`ROW_ITEM_CLASS`). Every other grid goes through `PosterGrid`, which is fluid at 2 and 4 columns and capped at 1200px, so at 1280px a grid card is about 288px, 1.6 times the row card. The column counts live in `PosterGrid` and the image `sizes` in `POSTER_SIZES`; if one changes without the other, every screen silently downloads the wrong image width, which is why `poster-grid.test.tsx` exists. Eager poster counts (`EAGER_POSTERS = 4`, copied in four files) and `LibrarySkeleton`'s one row are also tied to the column count. The season grid uses `PosterGrid` too, but holds a few seasons in a narrower detail layout.

**Title pages.** The movie page shows a hero, tracking, overview and cast; the show page adds meta, progress, your rating and seasons. Movies request `credits,translations` and shows `translations`. TMDB also offers videos, watch providers (supplied by JustWatch, whose attribution TMDB requires), recommendations, release dates with certifications, content ratings, and more detail fields the app currently drops. The constraint that shapes everything: `getTvShow` is the read the library pages run for every tracked show, up to 500 per tab, so anything appended to it is paid hundreds of times per library view. Watch providers and certifications are per country, the app stores no locale, and `lib/tmdb` forbids request state inside a cached scope. Embedding a third party player is a new processor under spec 0017, which requires `PROCESSORS`, the policy text and `LEGAL_LAST_UPDATED` to change in the same PR.

## Options considered

### Grid: a `columns` preset on `PosterGrid` (chosen)

`PosterGrid` takes `columns: "catalog" | "wide"`; each preset owns its class string, `sizes` and eager count in exported maps.

**Pros**: the column, sizes and eager invariant lives in one file and one test that loops over every preset; the season grid opts out by name.
**Cons**: callers of `wide` must pass its sizes to their cards; a small new API.

### Grid: a class override from the season grid

Change the default and let `SeasonGrid` pass overriding classes, merged by `cn`.

**Pros**: smallest change.
**Cons**: the invariant splits across files and the merge must undo three breakpoints, which the test cannot see.

### Grid: the season grid owns its own list

**Pros**: plain to read.
**Cons**: duplicates the cap, gap and list semantics, and the season grid escapes the sizes test.

### Data: one separate extras read per title (chosen)

A new cached read per title appends videos, recommendations, watch providers and release dates or content ratings in one TMDB request, `hours` lifetime. Crew and facts come from parsing more of the existing detail responses.

**Pros**: one request per title per hour shared by every visitor; the library reads are untouched; the shorter lifetime fits provider availability without shortening the movie read's `days`.
**Cons**: the details payload comes back a second time inside the extras response; two sections share one failure.

### Data: append to the existing detail reads

**Pros**: nothing new to wire.
**Cons**: the 500 show library read gets much heavier and the movie read inherits a shorter lifetime.

### Data: one read per section

**Pros**: each section fails alone.
**Cons**: four TMDB requests per cold title instead of one, against a rate limited API.

### Region: request header (chosen), fixed region, or account setting

The header follows the visitor with no storage, and the country is named on screen so a wrong guess is visible. A fixed region is wrong for most visitors; an account setting needs a migration and still needs a default for visitors who are signed out.

### Trailer: dialog with click to load embed (chosen) or a link out

A link out avoids a processor, but the owner asked for trailers on the page. Loading `youtube-nocookie.com` only on click keeps YouTube off every page view that does not ask for it.

## Rationale

The grid failure mode is silent (wrong image widths, nothing visibly broken), so the design keeps every number that depends on the column count in one exported map per preset, and the test iterates the map. The cross check showed the conditional `library` preset could not fail at a width that matters (library cards are 172px at 768px today and fit, and 6 columns give 186px), so it was dropped for one grid everywhere. The fixed 228px entry for the capped five column range removes an avoidable overshoot.

For the data, the deciding force is the library read: appending to `getTvShow` would multiply the cost of the new data by every tracked show, while a separate read costs one request per title per hour shared across visitors. Watch providers and certifications arrive for every country in one response, so the cache stays free of request state and the region is a cheap pick afterward, which honours the `lib/tmdb` rule. Hiding a missing age rating rather than falling back to another country, and naming the country on Where to watch, follow the project rule never to present data that may be false. Failure states follow spec 0021's row pattern (one line with Retry), so a slow or failing extras read never takes the page or its tracking down.

## Amendment 2026-10-12: recording what shipped

A review of the branch against this spec found five places where the build went past or beside the text. The owner kept each as built and asked for the spec to say so:

- **Cast as a carousel row.** Once More like this used the home row card, the old fixed width cast cards were the one row on the page drawn differently. Cast now uses the same card, scroller and skeleton, so the page has one row style.
- **Network name beside its logo.** TMDB's network logos come in both white and dark, so a logo alone vanishes on one of them. The name always shows, with the logo beside it on a neutral tile.
- **An error line with no cause.** "TMDB didn't respond" was untrue for a 404 or a bad response, which the extras read also turns into the error line, so the line now says only that the section couldn't load from TMDB.
- **The trailer paragraph in `/privacy`.** Saying when the YouTube player loads and whose policy then applies belongs beside the cookie text, in addition to the one country sentence AC-19 asked for.
- **The read signatures.** The extras reads follow the module's pair pattern: the cached twin returns a `TmdbResult` and the exported wrapper throws. The interface table described only the inner half.

## Amendment 2026-10-13: full grid rows

The owner asked for every row of a full page to be filled at every width, reversing the ragged last row accepted in the premise note above. 20 does not divide by 3 or 6, so at 6 columns a page ended 4 cards short.

Options weighed in the 2026-10-13 grilling session:

- **Columns that divide 20 (2, 4, 5)**: no data change, but drops 3 and 6 columns and grows desktop cards to about 228px. Recommended, not chosen.
- **24 a page with 2, 3, 4 and 6 columns (chosen)**: keeps six columns on wide screens and the 187px card. The premise note said a page size change could not work on TMDB pages fixed at 20; it can, by reading the two TMDB pages that hold each 24 title window. The cost is a second cached TMDB read per page and page numbers that move.
- **60 a page**: fills every column count but costs three TMDB reads and very long pages.
- **Hiding the extra cards**: titles would vanish between pages. Rejected.

Filtered search keeps its cursor and 20 match target: its pages were never a fixed size, and making them exactly 24 would mean rewriting spec 0010's scan and cursor for a cosmetic gain. Old page links are not redirected because the lists are re-ranked by TMDB daily, so a page number never named stable content. A failed half of a page shows the whole page's error, not a half page with a notice, so no new state is added. Page 417 under TMDB's 10,000 result cap shows its 16 titles rather than hiding them.
